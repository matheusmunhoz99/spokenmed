## O que o HAR revelou

Mapa completo dos POSTs `/ambulatorio/.../HandleEvent` entre login e a busca de CPF (62 eventos, ignorando `_dummy_`/`timer`):

```text
seq 0..3   boot     cinfo / afterrender O8 / load O86 / resize OCB    ← agente já faz
seq 4..f   popup    O58D activate/resize → O5BC load → O5DD selection
                    → O5A8 click (OK) → O58D beforeclose/deactivate    ← FALTA (escolha de unidade)
seq 10..13 menu     O86 itemclick id=1 (_fp_=O8A=…1) → O65 tabchange   ← FALTA (abrir Pacientes)
seq 14..1f tab open O611 show + várias tabchanges internas + OD29 load
seq 20     botão    O670 click (abrir prontuário)                       ← FALTA
seq 22..27 tab open O6A0 tabchange O6A9 → OC1A load → OAD0 load
seq 28     botão    O7B3 click (abrir CadSUS)                           ← FALTA
seq 2a..2f cadsus   O112A activate/resize → O1145 tabchange → O11B2 load ← tela CadSUS pronta
─────────────────────────────────────────────────────────────────────────
seq 36     consulta O117A click _fp_=O1162=…CPF                         ← worker já faz
```

Ou seja: tudo entre `seq 4` e `seq 2f` precisa ser tocado pelo agente antes de mandar a sessão pro Worker. Depois o `/cpf` do Worker continua igual.

## O que vou implementar

Em `spokenmed-agent/agent.py`, função `__init_ambulatorio` (logo após o shell ficar pronto), adicionar 4 fases novas, cada uma com helper `_post_amb` reutilizando o que já existe:

### 1. Escolher unidade (popup O58D)

POSTs sequenciais com bodies do HAR (seq 4..f), parametrizando apenas `_S_ID` e `_seq_`:
- `O58D move/activate/resize` + `O5BC load`
- `O5DD selectionchange` com `_fp_=%26O5BD%3D%25020%2502%2502%25034%2503NaN%2503%255B4%252C4%255D%2503`
  - O `%25034` (= "4") é o **índice da unidade selecionada**. Vou deixar configurável em `agent.cfg` como `FIORILLI_UNIDADE_INDEX=4` (default 4, igual ao HAR), porque a sua conta pode ter mais de uma unidade no futuro.
- `O5A8 click` (OK do popup)
- `O58D beforeclose/deactivate`

### 2. Abrir menu Pacientes (tree O86)

- `O86 itemclick id=1` com `_fp_=%26O8A%3D%25020%2502%2502%25031%2503`
- `O65 tabchange tab=OD77`

### 3. Abrir tela do prontuário e clicar em CadSUS

- `O611 resize/show` + `O6A0/O6E8/OB36 tabchange` (rebuild da janela do prontuário)
- `O670 click` (botão 1) → `O6A0 tabchange tab=O6A9` → `OC1A load` + `OAD0 load`
- `O7B3 click` (botão CadSUS) → `O112A activate/resize` → `O1145 tabchange tab=O114E` → `O11B2 load`

### 4. Esperar `O11B2` aparecer na resposta

Loop `_dummy_` no `O589` até a resposta de algum POST conter `O11B2` ou `O117A` — sinal de que o grid CadSUS está realmente registrado naquele `_S_ID`.

Só depois disso chamar `manda_sessao_pro_worker(sid_amb, cookies, last_seq_hex)`.

### Estrutura do código

```python
# helpers novos
def _amb_popup_unidade(post, sid, seq, idx_unidade):
    # seq 4..f; retorna seq atualizado
def _amb_abre_pacientes(post, sid, seq):
    # seq 10..1f
def _amb_abre_cadsus(post, sid, seq):
    # seq 20..2f; retorna seq atualizado
def _amb_espera_o11b2(post, sid, seq, max_polls=20):
    # _dummy_ até resposta conter "O11B2" ou "O117A"
```

Cada um devolve `(seq_atualizado, ok)`. Falha em qualquer um → log de ERROR + return None (ciclo entra em backoff de 60s, como hoje).

### Fallback se algum click vier vazio

Tem chance de a tela do prontuário não montar imediatamente (uniGUI às vezes precisa de `_dummy_` extra antes do click). Para cada `click` crítico (`O670`, `O7B3`), se a resposta for vazia/`<200 bytes`, faço 2 `_dummy_` no `O589` e tento o click de novo (máx 2 retries).

## Config nova

`agent.cfg.example` ganha:

```ini
# Índice da unidade no popup pós-login (0 = primeira). Default 4 (Teresópolis).
FIORILLI_UNIDADE_INDEX=4
```

## Worker

Nenhuma alteração — `/cpf` continua certo. Mas vou aproveitar para **adicionar log** no worker mostrando se a resposta do `O117A click` contém `O11B2` no body (sinal de que a tela está aberta). Isso ajuda no debug futuro sem mexer no agente.

→ Edit em `cloudflare-worker/src/index.js` linha ~181: incluir no `console.log("[cpf] POST consulta", …)` um campo `hasGrid: postText.includes("O11B2")`.

## Empacotamento

1. Atualizo `agent.py`, `agent.cfg.example`, `LEIA-ME.txt` (nova linha sobre `FIORILLI_UNIDADE_INDEX` + descrição "agora navega até CadSUS automaticamente").
2. `cp agent.cfg.example agent.cfg` (mantém valores default — usuário só precisa preencher username/password/api_key).
3. Gero `/mnt/documents/spokenmed-agent-v4.zip`.

## Como testar

Você roda `Iniciar Agente.bat` com o v4. Log esperado:

```
✓ ambulatorio pronto — sid=…
→ [amb] selecionando unidade idx=4
→ [amb] abrindo menu Pacientes
→ [amb] abrindo tela prontuário
→ [amb] abrindo CadSUS
✓ CadSUS pronto (O11B2 carregado) — sid=… seq=2f
✓ Worker atualizado: {"ok":true,...}
```

E aí busca de CPF passa a retornar os dados.