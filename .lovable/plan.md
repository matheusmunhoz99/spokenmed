
## Diagnóstico

O bootstrap atual faz:
1. Login no `/sis/`
2. Espera o iframe `box-1017` aparecer (timeout 45s) → **falha aqui**

O que falta: após o login, o sistema cai na **tela principal do sis.dll** com menu/desktop. O iframe `ambulatorio.dll` só é criado quando o usuário clica no item de menu "Ambulatório". Sem esse clique, `waitForAmbulatoryFrame` espera 45s em vão e dispara `iframe_ambulatorio_ausente`.

Depois que o módulo abre uma vez, os requests subsequentes para `HandleEvent` funcionam só com cookies + `_S_ID` — então só precisamos resolver a inicialização.

## Mudanças em `cloudflare-worker/src/fiorilli-do.js`

### 1. Novo passo `openAmbulatoryModule(page)` entre `submitLogin` e `waitForAmbulatoryFrame`

Após o submit do login, esperar a tela principal carregar e clicar no item de menu "Ambulatório". Estratégia em camadas (mais específica → mais genérica) para não depender de id frágil:

```text
a) Esperar que o login realmente passou:
   - URL mudou de /sis/ para /sis/sis.dll/... OU
   - Algum elemento do desktop principal apareceu (ex: barra de menu)
   - Timeout curto (10s) — se não passou, é credencial/rate limit

b) Localizar e clicar no item "Ambulatório":
   - page.evaluate scaneia: button, a, div, span, li, td com role/title/text
   - Match case-insensitive em /ambulat[óo]rio/
   - Preferência por elementos com classe ExtJS típica (.x-btn-inner, .x-menu-item-text)
   - Fallback: duplo-clique em ícone do desktop com mesmo texto

c) Se nenhum match, dump dos textos visíveis do menu pra log
   (primeiros 50 itens com texto) e lançar erro descritivo
   "menu_ambulatorio_nao_encontrado"
```

### 2. Tornar `waitForAmbulatoryFrame` mais tolerante

- Aceitar match por `src` contendo `ambulatorio.dll` OU `/ambulatorio/` (não depender do id `box-1017`, que pode mudar entre sessões/versões)
- Reduzir timeout para 20s nessa etapa (depois do clique, aparece em ~2-5s)
- Em caso de timeout, logar lista de todos os iframes presentes (id + src) para diagnóstico

### 3. Logs estruturados em cada etapa do bootstrap

```text
[do] step=goto_sis status=ok url=...
[do] step=submit_login status=ok
[do] step=wait_desktop status=ok
[do] step=open_ambulatorio status=ok via=menu_text
[do] step=wait_iframe status=ok src=...
[do] step=extract_sid status=ok
```

Assim, no próximo erro a gente sabe exatamente em qual passo morreu.

### 4. Persistência da sessão já está OK

Não mudar `persistSession`, `SESSION_TTL_MS`, parser, `rawLookup`. O fluxo HTTP puro continua igual depois que a sessão é criada.

## Validação após deploy

Rodar `curl` no terminal e checar os logs em tempo real:

```bash
cd cloudflare-worker
npx wrangler deploy
npx wrangler tail
```

Em outra aba:
```bash
curl.exe -H "x-api-key: Xofome23@" "https://spokenmed.meyssiner.workers.dev/cpf?cpf=34691780890"
```

Resultado esperado: JSON com `ok:true` e dados do paciente. Se falhar, os logs `step=...` indicam exatamente onde quebrou e ajustamos o seletor do menu.

## Pergunta aberta (opcional)

Se você souber o texto exato do item de menu (ex: "Ambulatório", "CadSUS", "Atendimento Ambulatorial"), me diga — eu coloco como primeiro match e os fallbacks como rede de segurança. Sem isso vou usar o regex `/ambulat[óo]rio/i` que cobre a maioria dos casos.
