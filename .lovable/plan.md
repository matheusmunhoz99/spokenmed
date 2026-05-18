## O que o HAR revelou

O CADSUS **não fica no app `/sis/`** (onde o agente loga). Ele fica em **outro app uniGUI**, montado em `/ambulatorio/ambulatorio.dll/`, com **sessão própria** (outro `_S_ID`, outra sequência de objetos).

Sequência real do navegador (resumida do seu HAR):

```text
1. GET  /sis/                              → _S_ID = UFE1s6yRno...   (sis)
2. POST /sis/sis.dll/HandleEvent           → cinfo / activate / show / login click / dummies
3. POST O106 Evt=itemclick id=1            → o servidor responde com um window.open
                                             para /ambulatorio/ambulatorio.dll/?user=<token-SSO>
4. GET  /ambulatorio/ambulatorio.dll/?user=<token>
                                           → _S_ID = 0_eSOxbjHxoG... (ambulatorio, NOVO)
5. POST /ambulatorio/ambulatorio.dll/HandleEvent  (~100 eventos)
   cinfo → activate → tabchanges → cliques em itens de menu (O670, O7B3…)
   até a tela CADSUS abrir (O112A activate, O11B2 load)
6. Só depois disso O117A (botão Pesquisar) existe e o clique funciona.
```

O Worker (`cloudflare-worker/src/index.js`) já chama o endpoint certo (`/ambulatorio/ambulatorio.dll/HandleEvent`) — mas está recebendo do agente o `_S_ID` do **/sis/**, que naquele sub-app não vale nada → `O117A` não existe → grid vazio → `cpf_nao_encontrado`.

## Plano de mudança no `spokenmed-agent/agent.py`

Manter os passos 1–6 atuais (login no `/sis/`). Depois adicionar:

**7. Disparar o item de menu que abre o ambulatorio (`O106 itemclick id=1`)**
- POST em `/sis/sis.dll/HandleEvent` com `Obj=O106&Evt=itemclick&id=1&_S_ID=<sid_sis>&_seq_=<próximo>&_uo_=OCC`.
- A resposta é JS uniGUI; extrair com regex a URL `/ambulatorio/ambulatorio.dll/?user=<hex_token>` (vem dentro de algo tipo `window.open("…")`).

**8. GET na URL do ambulatorio**
- Carregar `https://saudeteresopolis.oppcloud.com.br/ambulatorio/ambulatorio.dll/?user=<token>` reaproveitando os cookies da `requests.Session()` (a mesma cookie jar serve os dois apps — mesmo domínio).
- Capturar o **novo** `_S_ID` no HTML (`_S_ID=…`). A partir daqui esse é o sid que vai pro Worker.

**9. Inicialização do app ambulatorio**
- POST `Obj=O0&Evt=cinfo&ci=br%3D33%3Bos%3D4%3Bbv%3D146%3Bww%3D1920%3Bwh%3D1080&_S_ID=<sid_amb>&_seq_=0&_uo_=O0`
- POST `Obj=O8&Evt=afterrender&_seq_=1&_uo_=O0`
- POST `Obj=OCB&Evt=resize&w=1280&h=800&_seq_=…&_uo_=O0` (tamanho qualquer, mesmo do navegador)

**10. Navegação até a tela CADSUS**
- Replay determinístico dos cliques que o HAR mostra entre `_seq_=4d` e `_seq_=5d` (basicamente: `O670 click` → `O7B3 click`). Esses IDs (`O670`, `O7B3`, depois `O112A`/`O11B2`/`O117A`) são gerados pelo servidor em ordem de instanciação — se o agente replica os mesmos eventos na mesma ordem, os IDs batem.
- Parar quando a resposta indicar `O11B2` carregado (grid CADSUS pronto). Se 5 polls `_dummy_` em `O8` passarem sem novidade, segue.

**11. POST `/session/update` no Worker**
- Enviar `s_id = sid_amb`, `cookies = <jar concatenado>`, `seq = <último seq usado no ambulatorio em hex>`.

## Detalhes técnicos

- A cookie jar do `requests.Session()` serve os dois apps porque ambos estão em `saudeteresopolis.oppcloud.com.br` — não precisa separar.
- O HAR exportado **não tem corpos de resposta** (limitação de export do Chrome sem "Preserve log + bodies"). O agente precisa **logar a resposta do `itemclick`** na primeira execução pra confirmar o formato exato da URL retornada (provavelmente `_uw_(…)` ou `window.open("…")`). Já deixo um `log.debug("itemclick resp = %s", text[:500])` no código pra a gente ajustar a regex se vier diferente.
- Risco real: se a sequência de cliques `O670 → O7B3` não for determinística (ex.: depender de qual item do submenu o usuário clicou no dia da captura), o replay vai abrir tela errada. Mitigação: ao final do passo 10, validar que a resposta contém `O117A` antes de mandar pro Worker; senão, falha o ciclo e o agente loga "CADSUS não abriu — recapturar HAR".
- Worker e código do app web (`opp-client.server.ts`, `cadsus.functions.ts`) **não mudam**.

## Risco aberto que preciso confirmar com você

Olhando o HAR, depois do `O106 itemclick id=1` (que abre o ambulatorio) ainda há vários cliques **dentro** do ambulatorio (`O670`, `O7B3`) até CADSUS abrir. Não dá pra ter 100% de certeza, só com este HAR, se esses cliques são sempre os mesmos ou se dependem do estado da sessão. **A forma 100% segura** é eu implementar primeiro o passo 7–9 (abrir o ambulatorio e logar a resposta dos eventos), rodar uma vez, e te pedir os 5 primeiros bytes de log pra confirmar os IDs antes de hardcodar os cliques do passo 10.

Te peço aprovação pra eu seguir nessa abordagem em **2 fases**:
- **Fase A:** implemento passos 7–9 (abre ambulatorio, captura sid novo) + logging detalhado dos próximos eventos. Você roda uma vez e me cola o `agent.log`.
- **Fase B:** com base no log da fase A, eu hardcodo a sequência exata do passo 10 e fechamos o fluxo.

Se preferir, implemento já tudo num shot só assumindo que `O670 → O7B3` é determinístico — mais rápido, mas com chance maior de precisar de 1 ajuste depois.
