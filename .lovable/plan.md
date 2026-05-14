## Problemas atuais

1. Ao agendar pela fila, o PDF do comprovante baixa sozinho (sem perguntar).
2. O paciente "some" da fila depois de agendar — a página filtra apenas `status = 'aguardando'`.
3. Não há campo de urgência: paciente urgente não passa na frente.
4. Não há proteção contra duplicidade (mesmo paciente, mesma especialidade, mesma unidade, em aberto).
5. Posição é só FIFO por `created_at`, sem considerar urgência.

## O que vai mudar

### Banco (1 migration)

- Novo enum `fila_urgencia` com valores: `normal`, `prioritaria`, `urgente`.
- `fila_espera`:
  - adicionar coluna `urgencia fila_urgencia NOT NULL DEFAULT 'normal'`;
  - índice parcial único para impedir duplicidade em aberto:
    `UNIQUE (paciente_id, unidade_id, especialidade_id) WHERE status IN ('aguardando','agendado')`;
  - índice de leitura: `(unidade_id, especialidade_id, status, urgencia, created_at)`.

A migration roda sozinha; nada de dado existente é apagado (todos viram `normal`).

### Página `/app/fila` (`src/routes/app.fila.tsx`)

**Listagem**
- Buscar tanto `aguardando` quanto `agendado` (mesma unidade/especialidade).
- Ordenação canônica = ordem da posição:
  ```
  ORDER BY
    CASE status WHEN 'aguardando' THEN 0 ELSE 1 END,   -- agendado vai pro fim
    CASE urgencia WHEN 'urgente' THEN 0
                  WHEN 'prioritaria' THEN 1
                  ELSE 2 END,
    created_at
  ```
- Posição (`#1`, `#2`, …) é calculada **só entre `aguardando`**, particionada por especialidade. Itens já `agendado` aparecem com badge "Agendado" no lugar do número.
- Badge de urgência: cinza (Normal), âmbar (Prioritária), vermelho (Urgente).
- Filtro extra "Status": Aguardando (default) / Agendados / Todos.

**Adicionar à fila (`AddFilaDialog`)**
- Novo `RadioGroup` de urgência (Normal / Prioritária / Urgente), default Normal.
- Antes de inserir, checar duplicata: se já existe linha em aberto para o mesmo paciente+unidade+especialidade, mostrar toast "Paciente já está na fila desta especialidade" e não inserir. (O índice único é o backstop — tratar erro `23505` com a mesma mensagem amigável.)

**Alterar urgência depois (admin/recepção)**
- Botão extra na linha (ícone) → menu rápido para mudar urgência. Update direto na tabela; realtime já reordena para todos.

**Agendar pela fila (`AgendarFilaDialog`)**
- Mantém o fluxo atual de reservar slot + criar agendamento + marcar `fila_espera.status = 'agendado'` + `agendamento_id`.
- **Remover o download automático de PDF.** Substituir pelo mesmo `AlertDialog` de `/app/agendar` ("Agendamento criado. Imprimir comprovante agora?" → Sim/Não). Só baixa se o usuário escolher Sim.

**Tempo real**
- Já existe canal Realtime na tabela; vai continuar invalidando a query a cada mudança (insert / update de status / update de urgência). Como a ordenação é feita no servidor e a posição é recalculada a cada fetch, todos veem a mesma posição em segundos.
- Garantir que `fila_espera` está em `supabase_realtime` (já estava na migration original; a nova migration confirma com `ALTER PUBLICATION ... ADD TABLE IF NOT EXISTS`).

**Cancelamento de agendamento (já existe em `app.agenda-dia.tsx`)**
- Hoje o delete já volta a fila para `aguardando` quando o agendamento veio da fila — comportamento mantido. Como `created_at` original é preservado, o paciente volta para a posição equivalente automaticamente.

## Arquivos

**Novos**
- `supabase/migrations/<timestamp>_fila_urgencia.sql`

**Editados**
- `src/routes/app.fila.tsx` — listagem (status + urgência + posição), dialogs (urgência, sem PDF auto, alerta de comprovante), checagem de duplicata.

Sem mudanças em `app.agendar.tsx`, `app.agenda-dia.tsx` ou permissões.

## Validação após aplicar

1. Adicionar mesmo paciente 2x na mesma especialidade → bloqueado com mensagem.
2. Adicionar 3 pacientes "Normal" e 1 "Urgente" depois → urgente aparece como `#1`.
3. Agendar o `#1` → ele continua na lista com badge "Agendado", e o próximo aguardando vira `#1` automaticamente em outra aba (sem F5).
4. Ao confirmar agendamento, aparece o diálogo perguntando se quer imprimir — PDF só sai se clicar Sim.
5. Cancelar o agendamento na agenda do dia → paciente volta para `aguardando` na posição correta.
