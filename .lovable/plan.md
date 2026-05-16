## Diagnóstico

Login + abrir Ambulatório agora funciona. Mas o lookup volta `bodyLen: 158` (e na 2ª chamada `bodyLen: 2`), e dois sinais explicam:

1. **`iframe src= about:blank`** — `waitForAmbulatoryFrame` achou o elemento `<iframe>` pelo atributo `src` (regex bate em `ambulatorio.dll`), mas o `contentFrame.url()` ainda é `about:blank`: o iframe foi criado, marcaram o src, mas o documento ainda não navegou. O `.waitForFunction(() => readyState === 'complete')` está com `.catch(() => null)` — falha silenciosa.
2. **`cookies: 0`** — `page.cookies(pageUrl, frameUrl)` retorna vazio porque `frameUrl` é `about:blank` e nenhum cookie foi setado pro domínio `/ambulatorio/` ainda.

Resultado: a gente posta pra `/ambulatorio/ambulatorio.dll/HandleEvent` sem cookies de sessão e o servidor responde com uma mensagem curta (provavelmente um redirect/erro UnigUI de "session invalid"). Por isso o `looksLikeSessionExpired` dispara, refaz login, e o ciclo se repete.

## Mudanças no `cloudflare-worker/src/fiorilli-do.js`

### 1. `waitForAmbulatoryFrame` — esperar de verdade o frame navegar

- Primeiro, esperar até o `src` do iframe ser válido (não `about:blank`).
- Pegar o handle → `contentFrame()` → `frame.waitForNavigation({ waitUntil: 'networkidle0' })` OU `frame.waitForFunction(() => location.href.includes('ambulatorio.dll') && document.readyState === 'complete')` com timeout 25s.
- Sem `.catch(() => null)` silencioso: se falhar, logar `iframes=[{id,src,readyState}]` e estourar erro claro `iframe_nao_carregou`.
- Logar `step=wait_iframe ok src=<URL real>` com a URL navegada.

### 2. `bootstrap` — capturar cookies do domínio inteiro

Trocar `page.cookies(pageUrl, frameUrl)` por:
- `await page.cookies()` (cookies do contexto atual) **+**
- `await browser.defaultBrowserContext().cookies()` se disponível, ou iterar todas as URLs visitadas.
- Logar quantidade e nomes dos cookies (sem valores) pra confirmar que tem `JSESSIONID` / `UNGSESSID` / similar.

### 3. `rawLookup` — logar trecho do body quando vier curto

Quando `text.length < 500`, logar `[do] lookup body=<text>` (até 400 chars). Isso responde de uma vez o que o SIS está devolvendo: erro de sessão? redirect? CPF inválido? formato diferente?

### 4. `looksLikeSessionExpired` — não disparar refazer login no primeiro hit cru

Atualmente `js.length < 50` força refazer login. Se o servidor responder com 158 bytes contendo `setText` (resposta válida pequena), o regex acima `/\.setText\(/i` já bypassa — ok. Mas se for um erro `ajaxRedirect`, ele precisa pegar. Vou apertar pra: só refazer login se body contiver `ajaxRedirect|_S_ID|login` OU `length < 20`. Com o log do body (#3), confirmo o padrão real antes.

### 5. Bump `build = "fiorilli-debug-v6"` em `index.js` e log do bootstrap.

## Como validar

```bash
cd cloudflare-worker && npx wrangler deploy
curl "https://spokenmed.meyssiner.workers.dev/reset?api_key=Xofome23@"
npx wrangler tail spokenmed
# outro terminal:
curl "https://spokenmed.meyssiner.workers.dev/cpf?cpf=34691780890&api_key=Xofome23@"
```

Esperado:
- `step=wait_iframe ok src=https://saudeteresopolis.oppcloud.com.br/ambulatorio/ambulatorio.dll/?...`
- `session ready. cookies: N>0 names=[JSESSIONID,...]`
- `lookup body=<conteúdo real>` — com isso eu vejo se é erro de sessão, payload UnigUI válido, ou outro problema, e ajusto o parser / a chamada.

## Entrega

Vou copiar `cloudflare-worker/src/fiorilli-do.js` e `cloudflare-worker/src/index.js` v6 atualizados pra `/mnt/documents/`. Você substitui e roda `wrangler deploy`.
