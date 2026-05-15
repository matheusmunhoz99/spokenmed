# Refatoração da integração Fiorilli/CadSUS

## Objetivo
A tentativa atual de fazer login 100% via HTTP no SIS Fiorilli não funciona (o uniGUI exige um handshake de browser real). Vamos trocar **somente a etapa de login** por Puppeteer (Cloudflare Browser Rendering, já habilitado), persistir cookies + `_S_ID` em cache no Worker, e fazer todas as consultas de CPF como **POST HTTP puro** no `/ambulatorio/ambulatorio.dll/HandleEvent`, parseando o JavaScript de retorno.

Sem Durable Object (não disponível no plano). Usamos cache em memória do Worker + um lock simples para serializar o `seq`. É menos robusto que DO, mas funciona para o volume de uma clínica e é o melhor disponível sem upgrade.

## Arquitetura

```text
Frontend (botão "Buscar CadSUS" em /app/pacientes)
        │  useServerFn
        ▼
buscarPacienteCpf  (createServerFn, requireSupabaseAuth)
        │
        ▼
opp-client.server.ts
   ├── getSession()           → cache singleton (TTL 10 min)
   │     └── bootstrapWithPuppeteer()  ← @cloudflare/puppeteer
   │            • abre /sis/, digita user/senha, clica login
   │            • aguarda navegação para /ambulatorio/...
   │            • extrai cookies + _S_ID + seq inicial
   │            • fecha browser (≈ 1 chamada/10 min)
   │
   ├── lookupCpf(cpf)         → POST puro /ambulatorio/.../HandleEvent
   │     • fila serializada (mutex) p/ não colidir seq
   │     • seq incrementado em hex
   │     • ignora respostas vazias / timer
   │
   ├── parseUniguiResponse()  → regex em setText/stateValue/originalValue
   │     • mapeia O11CB→logradouro, O11CF→numero, O11D3→bairro,
   │       O11DB→cidade, O11E3→cns, O11E7→cns_secundario
   │
   └── retry: se resposta indica sessão expirada → invalida cache,
              re-bootstrap via Puppeteer, tenta de novo (1x)
```

## Mudanças por arquivo

**`wrangler.jsonc`** — adicionar binding de Browser Rendering:
```jsonc
"browser": { "binding": "BROWSER" }
```

**`package.json`** — `bun add @cloudflare/puppeteer`.

**`src/server.ts`** — passar `env.BROWSER` adiante via `globalThis` (ou ALS) para o `opp-client` acessar dentro do server fn (Cloudflare injeta env por request, não em escopo de módulo).

**`src/lib/opp-client.server.ts`** — reescrita:
- `bootstrapWithPuppeteer(env)`:
  - `puppeteer.launch(env.BROWSER)`
  - `page.goto('https://saudeteresopolis.oppcloud.com.br/sis/')`
  - `page.type('#O30 input', user)` / `page.type('#O34 input', pass)` / `page.click('#O40')`
  - `page.waitForNavigation()` até cair em `/ambulatorio/ambulatorio.dll/?user=...`
  - extrai `_S_ID` da URL/HTML, `document.cookie`, fecha browser
- `lookupCpf(cpf)`:
  - mutex global serializa requests
  - monta payload exato:
    ```
    Ajax=1&IsEvent=1&Obj=O117A&Evt=click&this=O117A
    &_S_ID=<sid>&fp=%26O1162%3D%25024%2502%2502<cpf-fmt>
    &seq=<hex++>&uo=O112A
    ```
  - headers: Cookie do jar, Origin, Referer `/ambulatorio/ambulatorio.dll/`, `X-Requested-With: XMLHttpRequest`
- `parseUniguiResponse(js)`: regex em `setText`, `stateValue`, `originalValue`, decodifica `\uXXXX`, retorna mapa `{ID → valor}` + dados normalizados
- detecção de sessão expirada: resposta sem nenhum `setText` + presença de redirect/login/`_S_ID inv`
- TTL 10 min + refresh proativo se expira em <60s

**`src/lib/cadsus.functions.ts`** — sem mudança de assinatura; apenas chama o novo `lookupCpf`. Resposta padronizada:
```ts
{ ok: boolean,
  dados?: { logradouro, numero, bairro, cidade, uf, cns, cns_secundario, telefone? },
  error?: 'config_ausente'|'login_invalido'|'cpf_nao_encontrado'|'lookup_sem_resposta'|'timeout'|'rede' }
```

**`src/routes/app.pacientes.tsx`** — ajustar para a nova forma `{ ok, dados }` (hoje espera `{ success, ... }`). Sem mudanças visuais.

**`src/lib/cadsus-diag.functions.ts`** — manter, atualizar o trace para refletir as novas etapas (`puppeteer.launch`, `puppeteer.login`, `http.lookup`).

## Detalhes técnicos importantes

1. **Browser Rendering só roda em runtime**: `env.BROWSER` é injetado por request. Acessamos via `getRequest()` + ALS, ou propagamos do `src/server.ts`. Não usar em escopo de módulo.
2. **Cache singleton no Worker**: cada isolate tem seu próprio cache. Em prática a Cloudflare reusa isolates, então o login custa ~1x a cada 10 min por isolate. Aceitável.
3. **Mutex de seq**: `Promise` chain global; cada lookup aguarda o anterior. Garante ordem do `seq` hex.
4. **Ignorar timers**: nunca disparamos `O589/timer` — apenas o click `O117A`. Já está correto.
5. **Sem endpoint público**: mantemos só a server function autenticada. Não expor `/api/public/cpf`.
6. **Logs**: mantém `[opp]` estruturado por etapa, mascarando CPF/credenciais.

## Limitações (te aviso para ficar claro)

- **Sem Durable Object**: se o Worker escalar para vários isolates, cada um abre seu próprio login. Não há "sessão única global". Para o uso interno da clínica isso é irrelevante.
- **Browser Rendering tem cota**: cada bootstrap consome 1 sessão de browser. Com TTL 10 min e cache, fica em poucos por hora.
- **Re-login automático**: implementado via retry 1x. Se o re-login falhar, retorna `login_invalido` e o usuário vê toast claro.

## Fora de escopo
- Endpoint público `/api/public/cpf` (você pediu só botão interno).
- Migração para Durable Object (requer plano pago).
- Mudanças visuais na tela de Pacientes.
