# Diagnóstico CadSUS — adicionar logs detalhados e endpoint de teste

## Por que está caindo em "indisponível"

A integração faz scraping de uma tela web do Fiorilli/OPP. Há **muitos pontos** onde pode falhar e hoje todos eles caem no mesmo `toast` genérico:

1. Variáveis de ambiente ausentes ou com URL errada
2. `GET /sis/` não retorna `_S_ID` (HTML diferente do esperado)
3. POST de login retorna mas **sem** `O1C8.setUrl(...)` → credenciais erradas, CAPTCHA, ou nomes de campo `O30/O34/O40` mudaram
4. Resposta é redirect (`302`) e não estamos seguindo
5. Cookies não estão sendo enviados de volta (sessão perdida entre requests)
6. Consulta de CPF responde, mas IDs `O11CB/O11CF/...` não existem nesse município
7. Cloudflare Worker bloqueado pelo firewall do OPP (User-Agent / origem)

Sem ver o que **realmente** voltou de cada passo, qualquer correção é chute.

## O que vou fazer

### 1. Logs estruturados em cada etapa de `src/lib/opp-client.server.ts`
Cada passo loga `step`, `status HTTP`, tamanho da resposta, `Set-Cookie` presentes, e um **preview** (~400 chars) do corpo — sempre **mascarando** usuário/senha/`_S_ID`/token. Etapas:

- `[opp] env` — confere se `OPP_BASE_URL`/`OPP_USERNAME`/`OPP_PASSWORD` estão setados (loga só presença e tamanho, nunca o valor)
- `[opp] GET /sis/` — status + se achou `_S_ID` no HTML
- `[opp] POST username (O30)` — status + cookies recebidos
- `[opp] POST password (O34)` — idem
- `[opp] POST login click (O40)` — status + se achou `setUrl(...ambulatorio...)` + preview mascarado
- `[opp] GET ambulatorio/?user=...` — status + se achou novo `_S_ID`
- `[opp] POST lookup CPF` — status + quantos `setText(...)` apareceram + preview

Exemplo de log de falha:
```
[opp] login_failed: token não extraído  status=200  bodyLen=812  preview="alert('Usuário ou senha inválidos');..."
```

Isso aparece nos **server function logs** (acessíveis via `stack_modern--server-function-logs`).

### 2. Códigos de erro mais granulares
Substituir o `fiorilli_indisponivel` único por:

- `config_ausente` (já existe)
- `seed_falhou` — `_S_ID` inicial não encontrado
- `login_invalido` — credenciais rejeitadas (resposta sem `setUrl`)
- `ambulatorio_indisponivel` — login OK mas módulo não abriu
- `lookup_sem_resposta` — CPF foi enviado mas resposta não tem `setText`
- `cpf_nao_encontrado`
- `timeout` / `rede` — falha de fetch

Cada um vira um `toast` diferente no front, com a causa real.

### 3. Endpoint de diagnóstico server-side
Criar `src/lib/cadsus-diag.functions.ts` com `diagnoseCadSus()` que executa o fluxo completo com um CPF de teste e retorna **todos os passos** + previews mascarados. Restrito a `requireSupabaseAuth`. Vou invocar via `stack_modern--invoke-server-function` (ou um botão temporário) para ver exatamente onde quebra **sem** te pedir para abrir DevTools.

### 4. Ajustes prováveis baseados nos logs (vou aplicar conforme o diagnóstico apontar)
- Seguir redirect 302 manualmente se o login responder com Location
- Adicionar `Origin` e `Referer` corretos a cada POST
- Reordenar a sequência (talvez precise primeiro abrir `/sis/sis.dll/` em vez de `/sis/`)
- Mudar a forma do `fp` (sua spec mostrava `&O1162=%024%02%02CPF` — `%02` é o byte STX, vou verificar se está sendo enviado corretamente)
- Se IDs internos (`O30`, `O34`, etc.) divergirem deste município, extraí-los do HTML em vez de hardcode

## Como vamos usar

1. Aplico os logs e o endpoint de diagnóstico (não mexe no comportamento atual).
2. Você tenta consultar um CPF (qualquer um, real, dessa região).
3. Eu leio os server logs com `server-function-logs`, identifico o passo exato que falhou, e corrijo.
4. Reaplico, você testa de novo. Loop curto até funcionar.

## Arquivos

**Editar**
- `src/lib/opp-client.server.ts` — logs em cada passo + códigos de erro granulares
- `src/lib/cadsus.functions.ts` — propagar novos códigos
- `src/routes/app.pacientes.tsx` — toasts específicos por código de erro

**Criar**
- `src/lib/cadsus-diag.functions.ts` — `diagnoseCadSus()` que devolve trace mascarado de todas as etapas

## Fora de escopo

- Esconder credenciais já está OK (estão em secrets, não no bundle).
- Não vou trocar a estratégia de scraping antes de ver os logs — qualquer mudança às cegas é perda de tempo.

## Aviso honesto

Se os logs mostrarem `login_invalido` (credenciais rejeitadas pelo Fiorilli), o problema **não é código** — é que a senha `2036` está incorreta, expirou, ou esse usuário não tem permissão de acessar o módulo Ambulatório. Nesse caso vou te dizer e a correção é trocar o secret `OPP_PASSWORD`.
