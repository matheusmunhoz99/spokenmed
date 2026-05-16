## Problema

A sessão (`_s_id`) hoje fica numa variável em memória no Worker (`let SESSION = {...}`). Cloudflare Workers rodam em "isolates" que podem ser reciclados a qualquer momento — e quando isso acontece, a variável zera. Por isso seu `/session` mostrou `hasSession:true` logo depois do capture, mas o `/cpf` (alguns segundos/minutos depois) já caiu em isolate novo e respondeu `sessao_ausente`.

## Solução: salvar em Workers KV

Workers KV é um storage chave/valor nativo do Cloudflare, grátis pra esse volume, persiste pra sempre (ou até você sobrescrever). Trocar memória → KV são ~15 linhas.

## Mudanças

**1. `cloudflare-worker/wrangler.jsonc`** — adicionar binding KV:
```jsonc
"kv_namespaces": [
  { "binding": "SESSION_KV", "id": "<id-criado-no-passo-2>" }
]
```

**2. Criar o namespace KV** (você roda 1x no terminal, dentro de `cloudflare-worker/`):
```
wrangler kv namespace create SESSION_KV
```
Ele devolve o `id` — você cola no `wrangler.jsonc`.

**3. `cloudflare-worker/src/index.js`** — trocar a variável `SESSION` por leitura/escrita no KV:
- `/session/update` e `/session/set` → `env.SESSION_KV.put("current", JSON.stringify({cookies, sId, seq, updatedAt}))`
- `/session` e `/cpf` → `const SESSION = JSON.parse(await env.SESSION_KV.get("current")) ?? {...vazio}`
- Incrementar `seq` também passa a ser persistido no KV a cada consulta

**4. Deploy** — `wrangler deploy`

## Como fica o fluxo depois

1. Você faz capture uma vez em `/capture` → salvo no KV
2. Consulta CPF quantas vezes quiser, em qualquer momento, de qualquer isolate → funciona
3. Só repete o capture quando a sessão do uniGUI expirar de verdade (erro `sessao_expirada` do próprio Fiorilli, não mais `sessao_ausente`)

## Alternativa (se você não quiser mexer no wrangler.jsonc agora)

Usar Durable Object — mas é mais complexo de configurar e você já tem o binding KV "gratuito". KV é o caminho mais simples.

---

**Confirma que posso implementar?** Vou precisar que você rode o comando do passo 2 (`wrangler kv namespace create SESSION_KV`) e me cole o `id` que ele devolver, ou pode me autorizar a inventar um placeholder e você troca depois.