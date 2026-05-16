## Arquitetura

Híbrido: Puppeteer só pra **login** (raro), `fetch` puro pras **consultas** (frequente).

```text
┌─ Worker /cpf?cpf=... ──────────────────────────────┐
│                                                     │
│  1. Pede sessão ao DO (FIORILLI_DO)                │
│     ├─ DO tem sessão válida? → devolve cookies+_S_ID│
│     └─ Não tem / expirou? → faz login Puppeteer,   │
│        salva cookies+_S_ID no DO, devolve          │
│                                                     │
│  2. Worker faz POST HTTP puro:                      │
│     /ambulatorio/ambulatorio.dll/HandleEvent       │
│     payload: Obj=O117A&Evt=click&fp=&O1162=<CPF>… │
│     headers: Cookie: <cookies do DO>                │
│                                                     │
│  3. Regex no body: setText("...") → extrai dados   │
│                                                     │
│  4. Se resposta indica sessão morta (login screen, │
│     redirect pra /sis/, body vazio) → invalida DO  │
│     e tenta de novo 1x                             │
│                                                     │
│  5. Devolve JSON { ok, dados }                     │
└─────────────────────────────────────────────────────┘
```

## Mudanças no código

### `src/lib/opp-client.server.ts` (reescrita)

Constantes no topo (todos hardcoded, confirmados estáveis por sessão):
```ts
const OBJ_BTN_BUSCAR = 'O117A';
const OBJ_CAMPO_CPF  = 'O1162';
const OBJ_CONTAINER  = 'O112A';
const FIELDS = {
  logradouro: 'O11CB',
  numero:     'O11CF',
  bairro:     'O11D3',
  cidade:     'O11DB',
  cns:        'O11E7',
  // (O11E3 = ?, descobrir depois)
};
```

Função principal `consultarCPF(cpf)`:
1. `getSession(env)` → retorna `{ cookies, sId, seq }` do DO
2. Monta payload:
   - `Ajax=1&IsEvent=1&Obj=O117A&Evt=click&this=O117A&_S_ID=<sId>`
   - `&_fp_=` URL-encoded de `&O1162=\x024\x02\x02<CPF formatado>` (formato `XXX.XXX.XXX-XX`)
   - `&_seq_=<seq hex>&_a_=1&_uo_=O112A`
3. POST com header `Cookie: <cookies>` + `Content-Type: application/x-www-form-urlencoded; charset=UTF-8` + `X-Requested-With: XMLHttpRequest`
4. Parse: `/O11CB\.setText\("([^"]*)"\)/` etc.
5. Se vier vazio / `redirect` / `relogin` / status≠200 → marca DO como inválido, repete 1x

### `src/lib/fiorilli-do.js` (refatoração — manter, mas mudar comportamento)

Estado guardado:
```ts
{
  cookies: string,          // Cookie header pronto
  sId: string,              // _S_ID
  seq: number,              // contador, incrementa atômico, serializa hex
  loggedInAt: number,       // timestamp
  expiresAt: number,        // loggedInAt + 25min
}
```

Métodos:
- `acquireSession()` — se válida, devolve; senão chama `doLogin()`. Mutex pra evitar logins concorrentes.
- `nextSeq()` — `++this.seq; return this.seq.toString(16)`. Atômico via `blockConcurrencyWhile`.
- `invalidate()` — limpa estado, força próximo login.

`doLogin()` (única parte com Puppeteer):
1. Abre `https://saudeteresopolis.oppcloud.com.br/sis/`
2. Digita usuário + senha (do `secrets`), clica entrar
3. Espera o iframe `ambulatorio.dll` carregar (já navega pra ele)
4. Extrai `document.cookie` da página do iframe + `_S_ID` (fica no JS global `O0._S_ID` ou no body de qualquer XHR — extrair via `page.evaluate`)
5. Fecha browser
6. Salva no estado, define `expiresAt = now + 25*60*1000`

**Crucial:** depois do login, **navega o browser pra dentro do iframe do ambulatório** (URL completo com `?user=…`) antes de extrair cookies, pra garantir que cookies do subdomínio `/ambulatorio/` estejam setados.

### Sessão expirada — como detectar
- Resposta sem nenhum `O11CB.setText` para CPF válido conhecido → expirou
- Resposta contém `_rdr_(` ou `window.location` → redirect (sessão morreu)
- Status 401/403 → morreu

Em qualquer um → `invalidate()` + retry 1x.

### `src/server.ts` — endpoint `/cpf`
Sem mudança grande. Só passa a chamar a nova `consultarCPF`. Erros possíveis:
- `cpf_invalido` (regex falha)
- `cpf_nao_encontrado` (todos os setText vazios)
- `login_falhou` (Puppeteer/Browser Rendering retornou erro — provavelmente rate limit)
- `rede` (fetch falhou)

### `wrangler.jsonc`
Mantém Browser Rendering binding e Durable Object. Sem mudanças.

## Por que isso resolve o problema de rate limit

- Browser Rendering só roda **1x a cada 25min** (login)
- 1 login ≈ 30s de browser time
- 25 min de uso = 30s de browser → **0,02 browser-min por sessão**
- Free tier (10 min/dia) → suporta **~1200 sessões de login/dia** = mais que o necessário
- Consultas individuais = 0 browser time, ilimitadas

## Ordem de implementação

1. Reescrever `fiorilli-do.js`: estado novo, mutex, `nextSeq`, `invalidate`, `doLogin` que extrai cookies+_S_ID após chegar no ambulatório
2. Reescrever `opp-client.server.ts`: constantes Obj, função `consultarCPF` HTTP puro com retry on stale
3. Ajustar `/cpf` route em `server.ts` (mínimo, só wire-up)
4. Deploy + teste com seu CPF

## Riscos / pontos de atenção

- **Format do CPF no `_fp_`:** o payload mostra `346.917.808-90` (com pontos e hífen). Se você passar o CPF cru (`34691780890`), provavelmente não vai achar. A função vai formatar antes de mandar.
- **Chars de controle (`\x02`):** o `_fp_` tem `%02` (STX) que é separador uniGUI. Vou montar bytes literais antes de URL-encode.
- **`_seq_` global vs por endpoint:** no `/sis/` o seq parecia incrementar no escopo da sessão inteira. Vou usar 1 contador único por sessão. Se der ruim, separo.
- **Cookies de 2 subdomínios:** `/sis/` seta cookies, `/ambulatorio/` setou outros. Vou capturar **todos os cookies do domínio** após o login chegar no ambulatório (`page.cookies()` do Puppeteer aceita filtro).
- **Timer ruidoso (`O589`/`O502`):** ignoro completamente — não chamo do Worker.

## Coisas que NÃO vou fazer

- Não vou mexer em UI / login da sua app — só backend Worker
- Não vou tocar em outras `*.functions.ts` (`cadsus`, `admin-users`, etc.)
- Não vou trocar Durable Object por KV — DO é necessário pro `seq` atômico

Aprova?