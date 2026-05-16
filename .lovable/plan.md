## Plano

### 1. Parar de perseguir o erro antigo
- O log publicado ainda mostra a mensagem antiga (`[do] /sis/ loaded`), enquanto o arquivo atual já deveria mostrar logs `step=goto_sis`, `login_form_candidates`, `submit_login via=...`.
- Isso indica que o Worker publicado não está usando a versão local mais recente, então qualquer teste agora está repetindo o mesmo código antigo.

### 2. Garantir deploy correto do Worker
- Ajustar a pasta/comando de deploy para garantir que o `cloudflare-worker/wrangler.jsonc` certo seja usado.
- Adicionar um identificador simples de versão no log/health, por exemplo `build: "fiorilli-debug-v2"`, para confirmar no tail que a versão nova entrou no ar.
- Depois do deploy, limpar/forçar renovação da sessão do Durable Object se necessário, porque ele pode manter estado antigo em memória/storage.

### 3. Validar com logs novos
- Rodar uma consulta e esperar estes logs:
  - `step=goto_sis`
  - `login_form_candidates=[...]`
  - `submit_login via=... navegou=...`
  - `step=wait_desktop`
  - `step=open_ambulatorio`
  - `step=wait_iframe`
- Se esses logs não aparecerem, o problema ainda é deploy/Worker errado, não login ou iframe.

### 4. Se o login automático continuar difícil, criar um modo de captura manual assistida
- Criar um endpoint/página temporária de diagnóstico no Worker, protegida por `API_KEY`, para abrir/instrumentar o fluxo.
- O usuário faz login manualmente no site oficial em uma aba controlada pelo fluxo de diagnóstico.
- A instrumentação registra com segurança os dados técnicos necessários: requests para `HandleEvent`, ids `Obj`, `_S_ID`, cookies de sessão, frame correto e payloads relevantes.
- Não usar isso como solução final com senha/cookies expostos no frontend; usar apenas para descobrir o fluxo real e depois integrar no backend.

### 5. Integrar a descoberta no fluxo final
- Com os ids/payloads confirmados, atualizar o Durable Object para inicializar o ambulatório e consultar CPF diretamente via `/ambulatorio/ambulatorio.dll/HandleEvent`.
- Remover ou desabilitar o modo de diagnóstico depois que a integração estiver funcionando.

## Observação importante
A ideia do “frontend para eu logar manualmente e interceptar tudo” é viável como ferramenta de diagnóstico, mas não é melhor como produto final: por segurança e por limitações de iframe/CORS, o caminho correto é usar isso só para capturar o fluxo uma vez e manter a automação final no backend.