## Diagnóstico

Boa notícia: o agente está rodando ponta-a-ponta — login `/sis/`, abertura do `ambulatorio`, captura do `_S_ID`, e POST `/session/update` no Worker (`{"ok":true,...}`).

Problema do "CPF não existe":

O Worker chama `POST O117A click` + `GET O11B2 data` (componentes da tela **Consulta CadSUS**). Mas o agente para no **shell vazio** do ambulatório — ele só faz `cinfo / afterrender / resize / _dummy_`. Olha o próprio comentário no `agent.py`:

> `# FASE A: por enquanto enviamos o sid do ambulatorio pro Worker assim mesmo. Se O117A ainda não existir (CADSUS não foi aberto), a busca vai falhar...`

Ou seja: a sessão é válida, mas como **a tela CadSUS nunca foi aberta**, os componentes `O117A` / `O11B2` / `O1162` não existem nesse `_S_ID`. O server uniGUI simplesmente ignora o click e devolve grid vazio → `cpf_nao_encontrado`.

Quando funcionava antes, era porque você capturava o cURL **depois** de navegar manualmente até CadSUS (e, provavelmente, depois de escolher a unidade). Agora que está 100% automatizado, falta essa navegação.

## O que precisa ser feito

Replicar dentro do `/ambulatorio/` os mesmos passos que você faz com o mouse após login:

1. Eventual popup/combo de **escolha de unidade** (se aparecer).
2. Clique no menu lateral até abrir **"Consulta CadSUS"** (a tela que tem o campo CPF e o grid de resultados).
3. Eventuais `_dummy_` polls até a tela carregar.
4. Só então mandar `s_id + seq` pro Worker (no estado correto, com `O117A/O11B2/O1162` registrados).

Sem essa sequência, qualquer CPF vai voltar como "não encontrado".

## Como vou descobrir os IDs/eventos certos

Não tenho como adivinhar os Obj/Evt corretos do menu interno do ambulatório — preciso de um HAR de **dentro** do ambulatório.

Procedimento (uma vez só):
1. Logue normalmente no Fiorilli, **abra o ambulatório**, escolha a unidade (se aparecer).
2. Abra o **DevTools → Network** ANTES de clicar em qualquer coisa, marque "Preserve log", filtre por `HandleEvent`.
3. Clique no menu até abrir **Consulta CadSUS** (a tela onde você digita CPF).
4. Clique exportar HAR → me manda o arquivo.

Com esse HAR eu identifico:
- Obj do menu lateral do ambulatório (algo tipo `O5A0/O3CC/...` — varia por instalação).
- Sequência `itemclick → load → afterrender → resize → _dummy_` da tela CadSUS.
- Popup de unidade (se houver) e como confirmá-lo via POST.

## Plano de implementação (depois do HAR)

1. Em `spokenmed-agent/agent.py`, na função `__init_ambulatorio`, **após** o shell ficar pronto:
   - (se necessário) selecionar unidade via POST do combo + clique "OK".
   - POST `itemclick` no menu para abrir CadSUS, com `_fp_` codificando o nó selecionado.
   - POSTs `afterrender / resize / _dummy_` até a tela responder com `O117A` / `O11B2` no payload.
2. Adicionar fallback: se algum POST devolver vazio, fazer setup (load/tabchange) e tentar de novo, como já fazemos no `/sis/`.
3. Atualizar mensagem de log para `✓ CadSUS pronto — sid=…` antes do `manda_sessao_pro_worker`.
4. Atualizar `LEIA-ME.txt` com a nova etapa e empacotar `spokenmed-agent-v4.zip`.

Nenhuma mudança no Worker é necessária — a parte de `/cpf` dele já está correta para a tela CadSUS.

## Próximo passo

Me manda o HAR de dentro do ambulatório (do login até a tela CadSUS pronta, sem digitar CPF ainda). Com ele eu fecho o ciclo e te entrego o zip v4 funcionando.