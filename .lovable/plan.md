## O que vai ser construído

Um **agente Python leve que roda no seu PC** e mantém a sessão do Fiorilli sempre quente no Worker — sem você nunca mais precisar copiar curl. Distribuído como **um único `.exe**` (PyInstaller, ~30-50 MB), com configuração via arquivo `.env` ao lado (pra trocar senha sem recompilar).

### Como funciona (visão simples)

```
┌─────────────────────────┐         ┌──────────────────┐         ┌──────────────┐
│ spokenmed-agent.exe     │  POST   │  Worker CF       │  POST   │  Lovable App │
│ (seu PC, roda em loop)  │ ──────▶ │ /session/update  │  ────▶  │  consulta CPF│
│                         │         └──────────────────┘         └──────────────┘
│ 1. Login no Fiorilli    │
│ 2. Captura _S_ID        │
│ 3. POSTa pro Worker     │
│ 4. dorme 30 min         │
└─────────────────────────┘
```

### Decisão técnica importante: como capturar o `_S_ID`

Tem dois caminhos. O plano cobre **os dois** — começamos pelo leve e, se o uniGUI não cooperar em HTTP puro, caímos pro Playwright.

**Caminho A (preferido) — HTTP puro com `requests**`

- ~10 MB de `.exe`, instantâneo, sem antivírus chiando.
- O Worker já provou que dá pra falar com o uniGUI via HTTP puro depois de logado. Falta só replicar o **login** em Python (GET inicial → POST com user/senha → ler `_S_ID` do response).
- Risco: uniGUI às vezes manda parte da sessão via JS após o login. Se não rolar em 1ª tentativa, plano B abaixo.

**Caminho B (fallback garantido) — Playwright headless**

- ~150 MB de `.exe` (embute Chromium).
- Abre browser invisível, preenche login, extrai `_S_ID` do tráfego. **Funciona com 99% de certeza** porque é exatamente o que o navegador faz.
- Antivírus às vezes resmunga com PyInstaller + binário Chromium — mitigamos com assinatura/whitelist nas instruções.

Implemento o A primeiro num script de teste rápido. Se der `_S_ID` válido, fecha. Se não, troco pra B sem retrabalho (a estrutura do agente é a mesma).

### Estrutura de arquivos (fora do projeto Lovable — repo separado do Worker)

```text
spokenmed-agent/
├── agent.py              # loop principal: login + POST update + sleep
├── fiorilli_login.py     # módulo do login (caminho A ou B)
├── .env.example          # template das credenciais
├── build.sh              # comando PyInstaller --onefile --noconsole
├── README.md             # instalação, Task Scheduler, troubleshooting
└── requirements.txt
```

`.env` que fica ao lado do `.exe` na máquina dele:

```
WORKER_URL=https://spokenmed.meyssiner.workers.dev
WORKER_API_KEY=<sua api key do Worker>
OPP_BASE_URL=https://saudeteresopolis.oppcloud.com.br
OPP_USERNAME=<usuário do Fiorilli>
OPP_PASSWORD=<senha do Fiorilli>
INTERVAL_MINUTES=30
```

### Comportamento do loop

1. Lê `.env`.
2. Faz login no Fiorilli, captura `_S_ID` (+ cookies se houver).
3. `POST /session/update` no Worker com a sessão fresca.
4. Loga em `agent.log` ao lado do .exe (sucesso/falha, sem expor senha).
5. Dorme `INTERVAL_MINUTES` minutos. Volta pro passo 2.
6. **Bônus**: pinga `GET /session` antes de relogar — se o Worker disser que a sessão atual ainda tá válida (testando com um CPF dummy), pula o login e só reagenda. Economia de tráfego no Fiorilli.

### Como você roda no Windows

Três opções, escolho a mais simples no README:

1. **Mais simples**: dá duplo-clique no `.exe`, fica rodando minimizado. Coloca atalho na pasta `shell:startup` → roda no login do Windows.
2. **Robusta**: Windows Task Scheduler → "Ao fazer logon" → ação: rodar o .exe. Marca "Executar mesmo se usuário desconectado" pra continuar rodando em sessões RDP fechadas.
3. **Avançada (depois, se quiser)**: instalar como serviço Windows via `nssm` — roda mesmo sem ninguém logado.

### Robustez

- **Retry exponencial**: se o login falhar (rede caiu, Fiorilli em manutenção), tenta de novo em 1min, 2min, 4min… até 30min.
- **Crash recovery**: try/except no loop externo, agente nunca morre. Erro vai pro log.
- **Detecção de senha errada**: se receber HTML de "credenciais inválidas", para de tentar e escreve mensagem clara no log (não fica martelando Fiorilli com senha errada).
- **Lock file**: evita rodar 2 instâncias ao mesmo tempo se você esquecer e abrir o .exe duas vezes.

### O que vou criar / mudar no projeto

- **Novo diretório `spokenmed-agent/**` dentro do repo do Lovable (ou posso te mandar como zip separado, sua escolha — diz aí). Não interfere em nada do app Lovable nem do Worker.
- **Zero mudança no Worker** — o endpoint `/session/update` já existe e funciona, é só o agente passar a chamar.
- **README com print-screen do Task Scheduler** pra você não se perder.

### Dúvidas rápidas antes de codar

1. **Qual o domínio exato do Fiorilli pra login?** O Worker usa `saudeteresopolis.oppcloud.com.br/ambulatorio/...` — o login é nesse mesmo host ou em outro (ex: `/login`, ou portal central)? [https://saudeteresopolis.oppcloud.com.br/sis/](https://saudeteresopolis.oppcloud.com.br/sis/)
2. **PC Windows, certo?** (assumo Win10/11 64-bit; macOS/Linux também dá, mas mudaria o build). é windows que vai rodar
3. **Credenciais ficam no `.env` ao lado do .exe** (fácil de trocar, mas qualquer um com acesso ao PC lê). Ou prefere **criptografar e pedir senha-mestra na primeira execução** (mais seguro, mas se você esquecer a senha-mestra precisa reconfigurar)? pode deixar no codigo fonte .exe mesmo, usuario adm senha 123
4. **Posso te entregar o** `.exe` **pronto compilado pelo Lovable** (eu monto, compilo aqui no sandbox e te mando como artifact pra download), ou prefere o código-fonte pra você compilar/auditar? pode ser, pode montar se quiser então e me envie