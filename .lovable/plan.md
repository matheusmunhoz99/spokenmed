## O que tá acontecendo

Worker retornou **401** na consulta. Isso é um de dois cenários:

- **(a) A sessão sumiu do KV** — significa que a persistência KV não tá funcionando (id errado no `wrangler.jsonc`, ou o deploy não pegou o binding)
- **(b) A sessão expirou no Fiorilli** — uniGUI invalida `_s_id` depois de alguns minutos de inatividade. Aí precisa repetir o `/capture`

Pra descobrir qual é, preciso que você abra no navegador:

```
https://spokenmed.meyssiner.workers.dev/session?api_key=Xofome23@
```

E me mande o JSON que aparecer. Se `hasSession: true` e `kv: true` → é cenário (b), só refazer capture. Se `hasSession: false` ou `kv: false` → é (a), KV não tá persistindo.

## Independente disso, vou melhorar o tratamento de erro no app

O toast "CadSUS indisponível no momento" é inútil — não diz o que fazer. Vou:

### 1. Adicionar os códigos `sessao_ausente`, `sessao_expirada` e `unauthorized` no tipo `ErrorCode`

Em `src/lib/opp-client.server.ts` — incluir esses 3 códigos que o worker já devolve mas o tipo TS não conhece.

### 2. Adicionar mensagens claras no `handleBuscarCadSus`

Em `src/routes/app.pacientes.tsx`, expandir o mapa `msgs`:
- `sessao_ausente` → "Sessão do CadSUS não configurada. Avise o administrador."
- `sessao_expirada` → "Sessão do CadSUS expirou. Avise o administrador para renovar."
- `unauthorized` → "Acesso ao CadSUS negado. Verifique a configuração."

### 3. Logar o `error` retornado no console do navegador

Pra eu (e você) ver com clareza qual código veio quando o toast aparecer, sem precisar dos logs do servidor.

---

## Próximo passo

Me cola o JSON do `/session?api_key=Xofome23@` que eu já implemento as melhorias acima e te falo se precisa refazer o capture ou se o problema é no KV.