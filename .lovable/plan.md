## Diagnóstico

O log mostra que **o login funcionou** (`submit_login via=text-exact:O40_id navegou=true`). O problema agora é que `waitForDesktop` retorna cedo demais: ele aceita qualquer `.x-btn` como sinal de desktop, mas os botões `Entrar` / `Sair` da tela de login ainda estão no DOM enquanto o splash **"Acessando SIS 9.0"** está rodando. Por isso o dump do `openAmbulatoryModule` só mostra:

```
Entrar, Sair, Acesso Público, Acessando SIS 9.0
```

O desktop com o menu "Ambulatório" ainda nem renderizou. Você já confirmou antes que o menu é **clássico ExtJS (menubar no topo)** — então depois que o splash sumir, talvez ainda seja necessário clicar no menubar pra ele abrir.

## Mudanças no `cloudflare-worker/src/fiorilli-do.js`

### 1. `waitForDesktop` — esperar splash sumir, não só `.x-btn`

Critério novo de sucesso (todos devem ser verdade):
- Texto `"Acessando SIS 9.0"` NÃO está mais visível.
- Inputs de login (`input[type="password"]` visível) sumiram.
- Existe `.x-menubar`, `.x-toolbar`, `.x-desktop` OU um `.x-btn` cujo texto contenha "Ambulatório|Cadastros|Configurações|Sair" (itens reais do menu).
- Timeout maior (25s) e log `step=wait_desktop` com a lista de botões visíveis quando estourar, pra confirmarmos.

### 2. `openAmbulatoryModule` — abrir menubar antes de procurar

Antes do scan atual, fazer:
1. Procurar elemento de menubar (`.x-menubar .x-btn`, `.x-toolbar .x-btn`) cujo texto seja exatamente `"Ambulatório"` e clicar.
2. Se não achar, abrir cada `.x-btn` visível do `.x-menubar` / `.x-toolbar` com `mouseover` + `click` (ExtJS abre dropdown no click), aguardar 200ms, e procurar `.x-menu-item-text` com "Ambulatório" dentro dos `.x-menu` recém-abertos.
3. Manter os fallbacks atuais (ext-selectors, generic).
4. Aumentar o filtro do dump: incluir `.x-menubar` / `.x-toolbar` / `.x-menu-item-text` separadamente pra debug.

### 3. Bump `build = "fiorilli-debug-v5"` em `index.js` (health) e log de bootstrap em `fiorilli-do.js`.

## Como validar

```bash
cd cloudflare-worker
npx wrangler deploy
curl "https://spokenmed.meyssiner.workers.dev/health"          # esperar build v5
curl "https://spokenmed.meyssiner.workers.dev/reset?api_key=Xofome23@"
npx wrangler tail spokenmed
# noutro terminal:
curl "https://spokenmed.meyssiner.workers.dev/cpf?cpf=34691780890&api_key=Xofome23@"
```

Resultado esperado no log:
- `step=wait_desktop status=ok` **depois** do splash sumir
- novo dump com botões do menubar (Ambulatório, Cadastros, etc.)
- `step=open_ambulatorio status=ok` e em seguida `step=wait_iframe`

Se o menubar tiver outro nome (ex.: "Atendimento" em vez de "Ambulatório"), o dump vai mostrar e ajustamos a regex.

## Entrega

Como você está rodando o worker fora do sandbox, depois das mudanças vou copiar `cloudflare-worker/src/fiorilli-do.js` e `cloudflare-worker/src/index.js` atualizados pra `/mnt/documents/` pra você substituir e `wrangler deploy`.
