## Causa raiz

O agendamento das 13:00 do Dr. Carlos Alberto (paciente Matheus Munhoz) tem uma linha vinculada em `fila_espera` com `status='agendado'` e `agendamento_id` apontando pra ele.

A FK `fila_espera.agendamento_id → agendamentos.id` está configurada como **`ON DELETE SET NULL`**. Quando o front faz `DELETE FROM agendamentos`, o Postgres dispara essa ação **antes** do trigger `fn_ag_after_delete` rodar — ele tenta zerar o `agendamento_id` da fila **mantendo** `status='agendado'`. Aí o trigger `BEFORE UPDATE` `fn_fila_check_link` barra:

```
IF NEW.status = 'agendado' AND NEW.agendamento_id IS NULL
  → RAISE 'fila_agendado_sem_agendamento_id'
```

Resultado: o DELETE inteiro é abortado e o `fn_ag_after_delete` (que faria a coisa certa: `status='aguardando'` + `agendamento_id=NULL`) nunca chega a rodar.

## Correção (frontend, sem mexer em DB)

Em `src/routes/app.agenda-dia.tsx`, função `handleDelete`, **inverter a ordem**:

1. Buscar a linha de `fila_espera` vinculada a `a.id`.
2. Se existir, **primeiro** atualizar `fila_espera` para `status='aguardando'` + `agendamento_id=NULL` (atualiza os dois campos juntos → passa o trigger).
3. **Depois** dar `DELETE` no agendamento. O FK `SET NULL` vira no-op (já está NULL) e o trigger não dispara erro.
4. Manter o `update slots → livre` (idempotente, o trigger `fn_ag_after_delete` já faz isso também).
5. Mostrar o toast adequado ("devolvido à fila" vs "excluído").

## Por que não mexer no banco

- A FK `ON DELETE SET NULL` + o trigger de consistência são corretos como proteção contra órfãos. O bug é só a ordem de operações no cliente.
- Mexer no trigger / FK exigiria migration e poderia abrir brecha pra estados inconsistentes vindos de outros caminhos.

## Arquivos afetados

- `src/routes/app.agenda-dia.tsx` (apenas a função `handleDelete`)

Sem migration, sem outras telas tocadas.