
## Problema real (revisado)

Dois sintomas no log:

1. **Deploy desatualizado** — o erro impresso é `"[do] ambulatório iframe não apareceu. URL: ... html:"`, formato que só existe no código antigo. Os passos novos (`[do] step=goto_sis`, `step=submit_login`, `step=wait_desktop`, `step=open_ambulatorio`) não aparecem em lugar nenhum. Conclusão: o `npx wrangler deploy` rodado anteriormente não pegou as últimas mudanças, ou ainda não foi rodado depois do último edit.

2. **Submit do login não está navegando** — após o "submit" a URL continua `/sis/` (página de login). Isso significa que o `submitLogin` clicou em algo errado ou em nada, e o formulário nunca foi enviado. Por isso o iframe do ambulatório nunca aparece — o usuário sequer está logado.

## Passo 1 — Confirmar deploy

Antes de qualquer mudança de código, rodar:

```bash
cd cloudflare-worker
npx wrangler deploy
```

E garantir que a saída mostra `Total Upload` com timestamp novo. Depois rodar `npx wrangler tail` e disparar o curl. A primeira linha esperada é `[do] step=goto_sis status=ok url=...`. Se aparecer `[do] /sis/ loaded:` (formato antigo), o deploy não pegou — verificar se há outro projeto/worker com mesmo nome ou se o `wrangler.toml/jsonc` está apontando pro lugar certo.

## Passo 2 — Diagnosticar o submit do login

Assumindo que o deploy passou e o erro persiste, preciso entender por que o submit não navega. Plano:

### 2a. Adicionar dump da página de login

No `submitLogin`, antes de tentar clicar, listar todos os candidatos a botão de login (id, tag, texto, type) e logar. Isso revela se `#O40` ainda é válido:

```text
[do] login_form_buttons=[
  {tag:"button", id:"O40", text:"Entrar"},
  {tag:"input", type:"submit", id:"O42", value:"OK"},
  ...
]
```

### 2b. Esperar navegação depois do submit

Hoje o código clica e segue direto. Adicionar `Promise.all([page.waitForNavigation({waitUntil:"networkidle0", timeout:15000}), submit])` ou esperar a URL conter `sis.dll`. Se o `waitForNavigation` der timeout, sabemos que o clique não disparou nada (botão errado) — e logamos isso explicitamente como `submit_login: navegacao_nao_ocorreu`.

### 2c. Verificar se há captcha / dialog / popup

Alguns ExtJS abrem dialog de boas-vindas, news, ou aviso de senha expirando. Após o submit, scanear `.x-window` / `.x-message-box` visíveis e fechar (clicar OK) antes de prosseguir.

### 2d. Tentar Enter no campo de senha como fallback

Se nem o `#O40` nem o scan genérico funcionarem, focar o campo de senha e `keyboard.press("Enter")` — em forms ExtJS isso geralmente dispara o submit.

## Passo 3 — Validar

Mesmo curl de antes. Logs esperados em sequência:

```
[do] step=goto_sis status=ok url=https://.../sis/
[do] login_form_buttons=[{...}]      ← novo dump
[do] step=submit_login status=ok via=#O40 navegou=true
[do] step=wait_desktop status=ok url=https://.../sis/sis.dll/...
[do] step=open_ambulatorio status=ok via=ext:.x-btn-inner (Ambulatório)
[do] step=wait_iframe status=ok src=https://.../ambulatorio/ambulatorio.dll/?_S_ID=...
[do] step=extract_sid status=ok
[do] session ready. cookies: N
```

Se algum passo falhar, o log do passo anterior diz exatamente o que veio.

## Arquivos a tocar

Só `cloudflare-worker/src/fiorilli-do.js`:
- `submitLogin(page)` — adicionar dump de candidatos, `waitForNavigation` paralelo, dismiss de dialogs pós-login, fallback Enter.
- Nenhuma outra função muda nessa rodada — `waitForDesktop`/`openAmbulatoryModule`/`waitForAmbulatoryFrame` já estão no estado certo, só não foram deployadas.

## Pergunta pra você

Antes de aprovar o plano: você confirma que rodou `npx wrangler deploy` **depois** do meu último edit? Se sim, manda a última linha do output do deploy (`Uploaded spokenmed (X.XX sec)` ou similar) — me ajuda a descartar problema de cache.
