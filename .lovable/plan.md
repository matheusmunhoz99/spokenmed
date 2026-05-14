
# Fila de Espera (Regulação - básico)

Adicionar um módulo de fila de espera por especialidade, mantendo o agendamento direto que já existe. Recepção/admin gerencia tudo, posição atualiza em tempo real, e ao agendar a entrada sai da fila automaticamente.

## Conceito

- Paciente entra na fila escolhendo **especialidade + unidade** (sem profissional fixo).
- Ordem = `created_at` (FIFO). Posição = quantos estão à frente com status `aguardando` na mesma fila.
- Status do item da fila: `aguardando` → `agendado` (link com `agendamentos.id`) → `concluido` / `cancelado` / `removido`.
- Ao agendar a partir da fila, o item vira `agendado` e some das listas ativas; se o agendamento for cancelado, recepção pode "devolver à fila" preservando a data de entrada original (mantém posição).

## Banco de dados (1 migration)

Tabela nova `fila_espera`:
- `paciente_id`, `unidade_id`, `especialidade_id`
- `status` enum: `aguardando | agendado | concluido | cancelado`
- `agendamento_id` (nullable, set quando agendado)
- `observacoes` (texto livre — encaminhamento/queixa)
- `criado_por`, `created_at`, `updated_at`
- Índices: `(unidade_id, especialidade_id, status, created_at)`

RLS espelha o padrão atual:
- Admin: tudo.
- Staff: ALL onde `user_can_access_unidade(auth.uid(), unidade_id)`.

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.fila_espera;` + `REPLICA IDENTITY FULL`.

Permissão nova `fila` em `MODULES` (label "Fila de Espera"), incluída por padrão para admin e administrativo (view+manage), médico não vê.

## UI / Rotas

**`/app/fila` — Lista da fila (nova rota)**
- Filtros: unidade (default = primeira permitida), especialidade (opcional), busca por nome/CPF.
- Tabela com colunas: **#Posição**, Paciente, Especialidade, Espera (dias desde entrada), Observação, Ações.
- Ações por linha: **Agendar** (abre dialog), **Editar obs.**, **Remover da fila** (admin).
- Botão "Adicionar à fila" no topo → dialog: busca paciente (mesmo padrão do `/app/agendar`), escolhe especialidade da unidade, observações.
- Subscrição Realtime em `fila_espera` filtrada por `unidade_id`: invalida `useQuery(["fila", unidade, espec])` em qualquer INSERT/UPDATE/DELETE → posição em tempo real para todas as recepcionistas.

**Dialog "Agendar da fila"**
- Mostra resumo do paciente + especialidade.
- Lista profissionais ativos da unidade que atendem aquela especialidade.
- Ao escolher profissional + data, lista slots livres (mesma query do `/app/agendar`).
- Confirmar: transação no cliente (pattern já usado em `agendar.tsx`):
  1. `UPDATE slots SET status='reservado'` (guard `eq status livre`)
  2. `INSERT agendamentos`
  3. `UPDATE fila_espera SET status='agendado', agendamento_id=...`
  4. Em erro, reverter slot para `livre`.
- Toast de sucesso, oferecer impressão de comprovante (reusa `gerarComprovante`).

**Integração com `/app/agendar` existente**
- Sem mudança de fluxo: adicionar um aviso discreto após escolher paciente — "Este paciente está na fila de {Especialidade} (posição #N). [Agendar a partir da fila]" — clica e pré-seleciona unidade/especialidade vindas da fila e marca o item como agendado ao confirmar.

**Integração com `/app/agenda-dia`**
- Ao excluir um agendamento que veio da fila (`fila_espera.agendamento_id = ag.id`): perguntar "Devolver paciente à fila?" → se sim, `UPDATE fila_espera SET status='aguardando', agendamento_id=null` (mantém `created_at` original = mantém posição).

**Sidebar** (`app-sidebar.tsx`)
- Novo item em "Operação": "Fila de Espera" → `/app/fila`, ícone `ListOrdered`, módulo `fila`.

## Posição em tempo real

Uma view materializada não vale a pena para esse volume. Calculamos no cliente:
- Query: `select id, created_at, paciente, especialidade, observacoes from fila_espera where unidade_id=? and status='aguardando' order by created_at`.
- Posição = índice + 1 (já filtrada por especialidade quando aplicável; quando "todas", agrupar por especialidade no front e numerar dentro do grupo).
- Realtime invalida a query → todos veem a posição mudar instantaneamente.

## Fora de escopo (para próximas iterações)

- Priorização clínica (idoso, gestante, risco)
- Exames/procedimentos
- Solicitação por médico ou unidade externa
- Auto-agendamento ao liberar slot
- Notificação SMS/WhatsApp ao paciente

## Arquivos

**Novos**
- `supabase/migrations/<timestamp>_fila_espera.sql`
- `src/routes/app.fila.tsx`
- `src/components/fila-add-dialog.tsx`
- `src/components/fila-agendar-dialog.tsx`

**Editados**
- `src/lib/permissions.ts` — adicionar módulo `fila`
- `src/components/app-sidebar.tsx` — novo item de menu
- `src/components/mobile-bottom-nav.tsx` — opcional, adicionar atalho
- `src/routes/app.agendar.tsx` — aviso "paciente está na fila"
- `src/routes/app.agenda-dia.tsx` — opção "devolver à fila" no excluir
