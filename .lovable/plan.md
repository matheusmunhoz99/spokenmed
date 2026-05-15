## Plano

Você cola 2 arquivos no Worker do Cloudflare, configura 4 secrets lá, e eu adapto o app pra chamar `https://spokenmed.meyssiner.workers.dev/` via HTTP — sem Puppeteer no Lovable.

## Parte 1 — Código que eu vou te entregar pra colar no Worker

### `src/index.js` (entrypoint do Worker)
- Endpoint `GET /cpf?cpf=XXXXXXXXXXX` protegido por header `x-api-key`.
- Valida CPF (11 dígitos), valida api key contra `env.API_KEY`.
- Encaminha pra Durable Object `FIORILLI_DO` (singleton) via `idFromName("global")` — garante 1 sessão Puppeteer reaproveitada, sem corrida de seq.
- Retorna JSON `{ ok, dados: { nome, logradouro, numero, bairro, cidade, uf, cns, cns_secundario, telefone } }` ou `{ ok:false, error }`.
- Endpoint `GET /health` sem auth pra teste rápido.

### `src/fiorilli-do.js` (Durable Object)
- Classe `FiorilliDO` exportada.
- Mantém em memória: `cookies`, `_S_ID`, `createdAt`, contador hex `seq`.
- `bootstrap()`: usa `@cloudflare/puppeteer` + `env.BROWSER` → abre `/sis/`, preenche `#O30/#O34`, clica `#O40`, espera `/ambulatorio/`, extrai `_S_ID` e cookies, fecha o browser.
- `lookup(cpf)`: POST puro `fetch` em `/ambulatorio/ambulatorio.dll/HandleEvent` com `fp=%26O1162%3D%25024%2502%2502<cpf-formatado>`, seq hex incremental, cookies em jar.
- Se resposta não tiver `.setText(`, considera sessão expirada → rebootstrap e tenta de novo (1x).
- Parser regex extrai `O11CB` (logradouro), `O11CF` (número), `O11D3` (bairro), `O11DB` (cidade-UF), `O11E3` (CNS), `O11E7` (CNS sec), + heurística pra nome (UPPERCASE com espaços) e telefone.
- TTL de sessão 10min.

### `wrangler.jsonc` do Worker (referência)
- Binding `BROWSER` (Browser Rendering) → você já habilitou.
- Binding `FIORILLI_DO` apontando pra classe `FiorilliDO` + migration `new_sqlite_classes`.

## Parte 2 — Secrets no Worker (Cloudflare dashboard)

Você adiciona em Workers → spokenmed → Settings → Variables and Secrets:
- `OPP_BASE_URL` = `https://oppcloud.com.br` (ou a base correta do Fiorilli)
- `OPP_USERNAME` = seu usuário
- `OPP_PASSWORD` = sua senha
- `API_KEY` = uma string aleatória que você cria (eu te passo um exemplo) — vai ser a mesma que o Lovable envia

## Parte 3 — Mudanças no app Lovable

1. **Remover Puppeteer**: deletar `@cloudflare/puppeteer` do `package.json` e do `src/lib/opp-client.server.ts`.
2. **Reescrever `src/lib/opp-client.server.ts`** como cliente HTTP fino:
   - Chama `fetch("https://spokenmed.meyssiner.workers.dev/cpf?cpf=...")` com header `x-api-key: process.env.CADSUS_WORKER_API_KEY`.
   - Mantém a mesma assinatura `buscarPacienteCpf` / `buscarPacienteCpfWithTrace` → zero mudança nos consumidores (`src/lib/cadsus.functions.ts`, `src/routes/app.pacientes.tsx`).
   - Trace passa a registrar status HTTP + preview da resposta JSON.
3. **Limpar `src/server.ts`**: remover `logEnvOnce` e `__CF_ENV` (não precisamos mais do binding BROWSER no app).
4. **Limpar `wrangler.jsonc`**: remover `"browser": { "binding": "BROWSER" }`.
5. **Secrets no Lovable** (eu vou pedir via tool):
   - `CADSUS_WORKER_URL` = `https://spokenmed.meyssiner.workers.dev`
   - `CADSUS_WORKER_API_KEY` = mesma string que você botou no Worker

## Ordem de execução quando você aprovar

1. Te mostro o conteúdo de `src/index.js`, `src/fiorilli-do.js` e `wrangler.jsonc` do Worker (pra você colar e fazer `wrangler deploy`).
2. Peço os 2 secrets no Lovable (`CADSUS_WORKER_URL`, `CADSUS_WORKER_API_KEY`).
3. Reescrevo `opp-client.server.ts`, limpo `server.ts` e `wrangler.jsonc`, removo dependência puppeteer.
4. Você publica o app e testa o botão de CPF. Se der erro, o trace agora mostra exatamente o que o Worker respondeu.

Quer que eu siga assim?