## Diagnóstico

A sessão do Fiorilli está sendo enviada corretamente pelo agente Python para o Worker (`/session` mostra `hasSession:true, sId len=19, seq=12`). O problema é **outro**: a busca de CPF (`/cpf?cpf=34691780890`) responde `cpf_nao_encontrado` mesmo para CPF válido.

### Por que está acontecendo

O Worker (`cloudflare-worker/src/index.js`) envia para o Fiorilli um clique no objeto `O117A` (botão Pesquisar do CADSUS), preenchendo o campo `O1162` (CPF) e lendo o grid `O11B2` + campos `O11CB…O11F3`.

Esses IDs de objeto uniGUI **só existem na sessão depois que a tela "Cadastro do Cidadão" (CADSUS) é aberta no menu**. O agente Python hoje faz apenas:

1. GET inicial (pega `_S_ID`)
2. `cinfo` / `activate` / `show`
3. clique no botão **Entrar** (`O40`)
4. polls `_dummy_` até a validação terminar

Depois disso o agente para — a sessão fica no shell do menu, mas a tela CADSUS nunca foi aberta. Quando o Worker dispara o clique em `O117A`, o servidor não conhece esse objeto naquela sessão, então o `setText` nunca vem e o grid volta vazio → o Worker classifica como `cpf_nao_encontrado`.

Funcionava antes via `/capture` porque você copiava o cURL **já navegando dentro do CADSUS no seu navegador**, ou seja, esses objetos já tinham sido instanciados.

## O que precisa ser feito

Adicionar no `agent.py`, depois dos polls `_dummy_`, a sequência de POSTs `HandleEvent` que abrem o módulo "Cadastro do Cidadão" (CADSUS) — o mesmo conjunto de cliques que o navegador faz quando você entra nessa tela.

Esses IDs (`Obj=...`, `Evt=click`, `_uo_=...`) são específicos da instalação do Fiorilli de Teresópolis e **não dá pra adivinhar** — precisamos capturar do navegador.

## Próximo passo (precisa de você)

Capturar um HAR **curto** com apenas a navegação até o CADSUS:

1. Faça login no Fiorilli normalmente no Chrome.
2. Abra DevTools (F12) → aba **Network** → ative **Preserve log** → clique no ícone de gravar (bolinha) e em **Clear** (🚫) pra zerar.
3. **A partir desse ponto**, navegue no menu até abrir a tela **"Cadastro do Cidadão"** (a tela onde tem o campo "CPF" e o botão "Pesquisar"). Pare assim que a tela aparecer — **não pesquise nada ainda**.
4. Na aba Network, botão direito em qualquer linha → **Save all as HAR with content** → me envia o arquivo.

Com esse HAR eu identifico a sequência exata de cliques (`Obj=...&Evt=click&...`) e adiciono no `agent.py` logo depois do passo 6 (polls `_dummy_`), antes do `return sid, cookies, last_seq_hex`. Depois disso a sessão chega no Worker já "armada" na tela do CADSUS e a busca passa a funcionar.

### Alternativa (sem HAR novo)

Se você não conseguir capturar agora, posso tentar uma heurística: deixar o agente abrir a URL do menu CADSUS direto e fazer os cliques mais comuns do uniGUI (`activate`/`show` no form principal do módulo). Tem chance de funcionar, mas é tentativa-e-erro — o HAR resolve de primeira.

## Resumo técnico

- **Arquivo a alterar:** `spokenmed-agent/agent.py` — função `login_e_captura_sid`, adicionar bloco "7) abrir CADSUS" depois dos polls.
- **Sem alteração no Worker:** ele já está correto, só está sendo chamado antes da hora.
- **Sem alteração no app web:** `src/lib/opp-client.server.ts` e `src/lib/cadsus.functions.ts` continuam iguais.
