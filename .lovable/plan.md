# Integração Fiorilli/OPP → SpokenMED (consulta de paciente por CPF)

## Ajuste de arquitetura (importante)

Você pediu uma **Supabase Edge Function**, mas este projeto roda em **TanStack Start (Cloudflare Worker)**, não em Edge Functions Deno. O padrão correto aqui é **`createServerFn`**, que entrega exatamente as garantias que você listou:

- credenciais só em `process.env` (nunca no bundle do browser)
- cookies/sessão ficam 100% no servidor
- o frontend chama por RPC tipado, sem ver payload, `_S_ID`, nem URL do Fiorilli
- mesmo runtime já autenticado (Supabase auth middleware)

Vou implementar como server function. Funcionalmente é idêntico ao que você descreveu.

## Pré-requisitos (vou pedir antes de codar)

1. **Secrets** via `add_secret`:
   - `OPP_USERNAME` = `fiorilli`
   - `OPP_PASSWORD` = `2036`
   - `OPP_BASE_URL` = `https://saudeteresopolis.oppcloud.com.br`
2. **Confirmação:** o host é mesmo Teresópolis (suas credenciais CadSUS anteriores eram de Álvares Florence-SP — quero garantir que estamos no sistema certo).

## O que vou construir

### 1. `src/lib/opp-client.server.ts` (server-only)
Cliente HTTP isolado com:
- **Cookie jar manual** (Map de `name → value`, serializa em `Cookie:` a cada request) — `fetch` no Worker não persiste cookies sozinho.
- `bootstrapSession()`:
  1. `GET /sis/` → guarda `Set-Cookie` e faz scrape do HTML para extrair o `_S_ID` inicial (procura `_S_ID=...` em scripts/inputs).
  2. `POST /sis/sis.dll/HandleEvent` enviando o usuário no campo `Obj=O30` (`Evt=change`), depois senha em `Obj=O34`, depois clique em `Obj=O40` `Evt=click`. Headers: `X-Requested-With: XMLHttpRequest`, `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `Referer: <base>/sis/`.
  3. Faz regex no JS de resposta para `O1C8.setUrl("...ambulatorio.dll/?user=TOKEN")` e extrai `TOKEN`.
  4. `GET /ambulatorio/ambulatorio.dll/?user=TOKEN` para abrir o módulo, captura novo `_S_ID` do ambulatório.
- `lookupCpf(cpf)`:
  1. `POST /ambulatorio/ambulatorio.dll/HandleEvent` com `Ajax=1&IsEvent=1&Obj=O117A&Evt=click&_S_ID=...&fp=...&seq=...&uo=O112A`.
  2. O `fp` carrega o CPF formatado: `&O1162=%024%02%02<CPF formatado>` (URL-encoded).
  3. Faz regex no JS de resposta:
     - `O11CB.setText("...")` → `endereco`
     - `O11CF.setText("...")` → `numero`
     - `O11D3.setText("...")` → `bairro`
     - `O11DB.setText("...")` → `cidade` (separa `CIDADE-UF`)
     - `O11E3.setText("...")` → `cns`
     - `O11E7.setText("...")` → `cns_secundario`
     - varre os demais `setText` do payload para tentar achar `nome` e `telefone` (vou logar o JS bruto na primeira execução para mapear os Obj IDs corretos — sua spec não os trouxe).
- **Sessão em memória**: cache singleton no módulo (TTL 10 min) com lock simples para evitar 2 logins simultâneos.
- **Retry de sessão**: se a resposta da consulta vier vazia ou contiver `login` / `_S_ID inválido`, descarta cache, refaz `bootstrapSession()` e tenta a consulta 1× a mais.
- Timeouts de 10s por request (`AbortController`), todos os erros logados sem expor senha/sessão.

### 2. `src/lib/cadsus.functions.ts`
```ts
export const buscarPacienteCpf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])           // só usuário logado pode chamar
  .inputValidator(z.object({ cpf: z.string().regex(/^\d{11}$/) }).parse)
  .handler(async ({ data }) => {
    return await lookupCpf(data.cpf);          // { success, nome, cpf, endereco, ... }
  });
```
Resposta padronizada: `{ success: true, ...campos }` ou `{ success: false, error: "cpf_nao_encontrado" | "fiorilli_indisponivel" }` — nunca vaza stack/sessão.

### 3. Integração no cadastro de paciente (`src/routes/app.pacientes.tsx`)
- Adiciono um botão **"Buscar no CadSUS"** ao lado do campo CPF (e onBlur quando CPF tiver 11 dígitos válidos).
- Chama `buscarPacienteCpf` via `useServerFn`.
- Preenche apenas campos vazios: `nome`, `cns`, `logradouro`, `numero`, `bairro`, `cidade`, `uf`, `telefone`.
- Spinner inline + toast de sucesso/falha. Não bloqueia o cadastro se a consulta falhar.

## Segurança (atende todos os "NÃO FAZER")

- ❌ Nada de `_S_ID`, cookies, payload Fiorilli, URL interna, ou credenciais no bundle do browser — tudo vive em `*.server.ts` + `.functions.ts`.
- ✅ `requireSupabaseAuth` exige usuário logado SpokenMED para invocar.
- ✅ Validação de CPF (11 dígitos + dígitos verificadores antes de enviar).
- ✅ Logs no servidor não imprimem usuário/senha/`_S_ID` — só CPF mascarado e código de erro.

## Limites conhecidos (quero ser honesto)

1. **Scraping é frágil**: se o Fiorilli mudar nomes de campos (`O30/O34/O40/O117A/...`) ou trocar a estrutura do JS de resposta, a integração quebra silenciosamente. Mitigação: erros estruturados + log do HTML/JS recebido (sem credenciais) para diagnóstico rápido.
2. **`fp/seq/uo`**: sua spec descreve a forma geral, mas o `seq` parece ser um contador da sessão (visto `seq=346` no exemplo). Vou começar com `seq=1` e incrementar; se o servidor exigir o valor real, leio do HTML da tela do ambulatório antes de submeter.
3. **Termos de uso**: automatizar login/scraping de portal municipal pode violar contrato com a prefeitura/fornecedor. Confirme internamente que está autorizado antes de publicar.
4. **CAPTCHA / 2FA**: se o Fiorilli adicionar um, a integração para de funcionar — não há contorno legítimo.

## Arquivos

**Criar**
- `src/lib/opp-client.server.ts`
- `src/lib/cadsus.functions.ts`

**Editar**
- `src/routes/app.pacientes.tsx` (botão CadSUS + autopreenchimento)

**Secrets a adicionar**
- `OPP_USERNAME`, `OPP_PASSWORD`, `OPP_BASE_URL`

## Fora de escopo

- Edge Function Deno (substituída por server function — mesma garantia, stack correto).
- Cache persistente (Redis/DB) — fica em memória do worker por enquanto.
- Tela admin para reconfigurar credenciais — gerenciado via secrets do Lovable Cloud.
