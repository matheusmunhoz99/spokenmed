## O que já existe

- **Agenda do Dia** e **Fila** já têm um `AlertDialog` antes de excluir/remover.
- Toda exclusão em `agendamentos` e `fila_espera` já é gravada em `audit_logs` via trigger `fn_audit_row` (com `before_data`, usuário, e-mail, role, IP, UA, timestamp). A página `/app/auditoria` (somente admin) já consegue ver isso.

O que falta: confirmação **mais informativa** (avisar quando o paciente veio da fila, mostrar dados do agendamento), campo **motivo**, e um jeito fácil de consultar o histórico de exclusões depois.

## Mudanças

### 1. Agenda do Dia — `src/routes/app.agenda-dia.tsx`

- Quando o usuário clicar em excluir, antes de abrir o diálogo (ou logo na abertura) consultar `fila_espera` pra saber se o agendamento veio da fila.
- Diálogo de confirmação reformulado:
  - Mostra **paciente, código do agendamento, profissional, data e horário**.
  - Se vier da fila: **alerta laranja** "Este paciente veio da fila de espera — será devolvido pra fila como 'aguardando'."
  - Campo **Motivo da exclusão** (textarea, opcional).
  - Botão "Excluir" desabilitado enquanto a checagem não termina.
- `handleDelete` passa a:
  1. Inserir uma linha em `agendamento_historico` com `evento='excluido'`, `motivo`, `de = snapshot do agendamento` e `user_id` (preserva o registro mesmo após o DELETE — a tabela não tem FK em cascata pra agendamentos).
  2. Liberar a fila (já implementado).
  3. Deletar o agendamento.
  4. Toast confirmando + se foi devolvido pra fila.

### 2. Fila — `src/routes/app.fila.tsx`

- Diálogo "Remover da fila" ganha:
  - Resumo: paciente, especialidade, urgência, data de entrada na fila.
  - Aviso amarelo se o item estava `agendado` (raríssimo, mas possível): "Este item está vinculado a um agendamento ativo — remova primeiro pela agenda."
  - Campo **Motivo** (textarea, opcional).
- `handleRemover`:
  - Antes do DELETE, dar um `UPDATE` em `fila_espera` setando `observacoes = COALESCE(observacoes,'') || ' [REMOVIDO em <data> por <email>: <motivo>]'`. Isso garante que o `before_data` capturado pelo trigger de auditoria no DELETE já contenha o motivo (sem precisar de schema novo).
  - Depois o DELETE normal.

### 3. Histórico de exclusões — `src/routes/app.auditoria.tsx`

- Adicionar um **chip/atalho de filtro "Exclusões"** que aplica `acao=DELETE` (e opcionalmente filtra por tabela em `agendamentos`/`fila_espera`).
- Garantir que a coluna mostre o nome do paciente extraído de `before_data->>'paciente_id'` resolvido (ou só o conteúdo bruto já existente, sem inflar a tela).
- Sem mudanças de schema — só UI de filtro.

## Por que não criar tabela nova de "exclusões"

`audit_logs` já cumpre o papel: armazena o registro inteiro (`before_data`), quem apagou, quando, IP e módulo. `agendamento_historico` complementa com motivo livre amarrado ao agendamento. Duplicar isso traz risco de divergência.

## Arquivos afetados

- `src/routes/app.agenda-dia.tsx` — diálogo + handleDelete.
- `src/routes/app.fila.tsx` — diálogo + handleRemover.
- `src/routes/app.auditoria.tsx` — atalho de filtro "Exclusões".

Sem migration. Sem mexer em triggers/RLS.