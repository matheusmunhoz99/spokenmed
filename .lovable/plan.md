## Diagnóstico (HAR vs agent.py atual)

O 401 no `cinfo` vem do uniGUI rejeitando o request porque o agente está mandando **3 coisas erradas** que o servidor valida estritamente:

### 1. Headers customizados sobrando
- **Navegador real:** zero headers customizados. Sem `_s_id`, sem `unisessionid`. Nem cookies. A sessão vive 100% no parâmetro `_S_ID=` do body.
- **Agente hoje:** manda `_s_id: xxx` e `unisessionid: xxx` como headers. O servidor estranha e devolve 401.

### 2. Formato do `ci` (info do browser)
- **Real:** `ci=br=33;os=4;bv=146;ww=758;wh=967` (URL-encoded → `br%3D33%3B...`)
- **Agente hoje:** `ci=12,Chrome,Windows,1920,1080` (formato totalmente inventado). O servidor faz parse desse campo e quebra.

### 3. Estrutura do body do `cinfo`
- **Real:** `Ajax=1&IsEvent=1&Obj=O0&Evt=cinfo&ci=...&_S_ID=...&_seq_=0&_uo_=O0`
- **Agente hoje:** tem `this=O0` a mais, não tem `_uo_=O0`, e usa `_seq_=1` em hex quando o real usa `_seq_=0` em decimal.

### 4. Faltam dois eventos antes do login
Entre `cinfo` e o clique em "Entrar", o navegador sempre dispara:
- `activate` (seq=1) no `O0`
- `show` (seq=2) no `O0`

Sem esses dois, o servidor considera a sessão "não montada" e o clique do `O40` é ignorado.

### 5. Formato do `_fp_` no clique
- **Real:** `_fp_=&O34=\x022\x02\x02123` (com STX como separador — uniGUI rastreia state de campos modificados).
- **Agente hoje:** `_fp_=&O30=admin&O34=123` (valores crus, sem o protocolo de change-tracking). O servidor não interpreta isso como "campos preenchidos".

## Plano de correção (em `spokenmed-agent/agent.py`)

Reescrever a função `login_e_captura_sid()` pra bater **byte por byte** com o HAR:

```text
1. GET https://.../sis/                          → extrai _S_ID do HTML (já funciona)
2. POST /sis/sis.dll/HandleEvent                 → cinfo  (seq=0, _uo_=O0, ci no formato correto)
3. POST /sis/sis.dll/HandleEvent                 → activate (seq=1)
4. POST /sis/sis.dll/HandleEvent                 → show     (seq=2)
5. POST /sis/sis.dll/HandleEvent                 → click O40 (seq=3) com _fp_ contendo
                                                    O30 e O34 no formato STX-separado:
                                                    &O30=\x020\x02\x02admin&O34=\x020\x02\x02123
6. Verificar resposta: deve conter JS de inicialização (sem "senha inválida")
```

**Headers (todos os POSTs):** apenas os 5 que o navegador usa de fato:
- `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`
- `X-Requested-With: XMLHttpRequest`
- `Accept: */*`
- `Origin: https://saudeteresopolis.oppcloud.com.br`
- `Referer: https://saudeteresopolis.oppcloud.com.br/sis/`

Remover completamente `_s_id` e `unisessionid` dos headers. Manter os cookies que o `requests.Session` coleta naturalmente do GET inicial (mesmo que servidor não envie nenhum no momento, deixar habilitado por segurança).

## Plano de validação

Antes de empacotar o ZIP novo:
1. Rodar o `agent.py` corrigido aqui no sandbox apontando pro Fiorilli real.
2. Verificar logs: `_S_ID inicial`, `cinfo OK`, `activate OK`, `show OK`, `click OK`.
3. Confirmar que o POST `/session/update` no Worker retorna `ok:true`.
4. Disparar um `/cpf?cpf=...` no Worker (com um CPF real que você tenha) pra confirmar que a sessão capturada realmente funciona end-to-end.
5. Se passar, rebuild do bundle Windows e gerar `SpokenMED-Agente-Windows-v2.zip` em `/mnt/documents/`.

## O que NÃO vou mexer

- Worker Cloudflare (já tá certo)
- Frontend
- `agent.cfg`, launchers `.bat`/`.vbs`, `LEIA-ME.txt`
- Lógica de loop / backoff / lock file
- Credenciais hardcoded (admin/123)

Só toco em `login_e_captura_sid()`, `_ajax_headers()` e adiciono dois POSTs novos (`activate` + `show`).
