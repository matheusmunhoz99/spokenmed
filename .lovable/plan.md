
# Roadmap em fases

Vou entregar uma fase por vez. Cada fase = migration própria + código + tela testável, sem quebrar o que já funciona.

1. **Fase 1 (este plano)** — Integridade automática + Auditoria LGPD
2. Fase 2 — Reagendamento + Encaixe
3. Fase 3 — Anexos (Storage privado)
4. Fase 4 — Dashboards + Relatórios SUS
5. Fase 5 — Segurança (sem MFA, conforme decidido) + mascaramento + sessões
6. Fase 6 — Painel do Cidadão (código do agendamento + CPF)
7. Fase 7 — Campos SUS (CNES/CBO/SIGTAP) + Operacionais + Performance

Decisões aplicadas: **sem MFA**, **sem notificações externas agora**, cidadão autentica por **código do agendamento + CPF**.

---

# Fase 1 — Integridade automática + Auditoria LGPD

## Objetivo
Garantir que (a) não exista inconsistência possível entre `slots`, `agendamentos` e `fila_espera`, e (b) toda ação sensível fique registrada com quem/quando/o quê/de onde, atendendo LGPD art. 37 (registro de operações).

## Migration única — `audit + integridade`

### Tabela `audit_logs`
Colunas:
- `id uuid pk`
- `tabela text not null` (ex: `agendamentos`, `fila_espera`, `pacientes`, `user_roles`, `auth`)
- `registro_id uuid` (nullable — login/logout não tem)
- `acao text not null` — enum check: `INSERT|UPDATE|DELETE|VIEW|LOGIN|LOGOUT|EXPORT|DOWNLOAD`
- `before_data jsonb`
- `after_data jsonb`
- `diff jsonb` (campos alterados em UPDATE — calculado pelo trigger)
- `user_id uuid`
- `user_email text`
- `user_role text`
- `unidade_id uuid` (quando aplicável, p/ filtro)
- `modulo text` (ex: `fila`, `agendar`, `pacientes`, `auth`, `usuarios`)
- `ip inet`
- `user_agent text`
- `created_at timestamptz default now()`

Índices: `(tabela, registro_id)`, `(user_id, created_at desc)`, `(modulo, created_at desc)`, `(created_at desc)`, GIN em `diff`.

RLS: somente `admin` pode SELECT. INSERT permitido apenas por `SECURITY DEFINER` (triggers e RPC). Nenhum UPDATE/DELETE para ninguém (append-only).

### Função genérica de auditoria
```
public.fn_audit_row() RETURNS trigger SECURITY DEFINER
```
- Lê `current_setting('app.audit_ip', true)`, `app.audit_ua`, `app.audit_modulo` (definidos em cada chamada server-fn via `SET LOCAL`).
- Calcula `diff` em UPDATE (apenas campos que mudaram).
- Resolve `user_email` via `auth.users`.
- Insere em `audit_logs`.

Aplicar trigger `AFTER INSERT/UPDATE/DELETE` em: `agendamentos`, `fila_espera`, `pacientes`, `slots` (só DELETE/UPDATE de status), `user_roles`, `user_permissions`, `user_unidades`, `profissionais`, `unidades`, `especialidades`, `agendas_config`.

### RPC `log_view(p_tabela, p_registro_id, p_modulo)` e `log_auth(p_acao)`
`SECURITY DEFINER`. Usados pelo frontend/server-fn para registrar VIEW de prontuário e LOGIN/LOGOUT.

## Triggers de integridade

1. **`trg_ag_cancel_libera_slot`** — `AFTER UPDATE OF status ON agendamentos`
   - Se novo `status = 'cancelado'` e antigo era `agendado|confirmado|realizado`: `UPDATE slots SET status='livre' WHERE id = OLD.slot_id`.
   - Se existir `fila_espera.agendamento_id = NEW.id`: voltar para `status='aguardando'`, `agendamento_id=null`.

2. **`trg_ag_delete_libera_slot`** — `AFTER DELETE ON agendamentos` — mesma liberação.

3. **`trg_ag_insert_reserva_slot`** — `BEFORE INSERT ON agendamentos`
   - Lock do slot (`SELECT ... FOR UPDATE`); se `status<>'livre'` → `RAISE EXCEPTION 'slot_indisponivel'`.
   - Verifica coerência `slot.profissional_id = NEW.profissional_id`, `slot.unidade_id = NEW.unidade_id`, `slot.data = NEW.data`, `slot.hora_inicio = NEW.hora_inicio`. Diferença → exceção.
   - `UPDATE slots SET status='reservado'`.

4. **`trg_ag_no_overbooking`** — índice único parcial:
   `CREATE UNIQUE INDEX agendamentos_slot_ativo ON agendamentos(slot_id) WHERE status IN ('agendado','confirmado','realizado');`
   Garante 1 agendamento ativo por slot, no banco, de forma atômica.

5. **`trg_paciente_no_conflito`** — índice único parcial:
   `(paciente_id, data, hora_inicio) WHERE status IN ('agendado','confirmado')` — mesmo paciente não pode ter 2 consultas no mesmo horário.

6. **`trg_fila_link_agendamento`** — `BEFORE UPDATE ON fila_espera`
   - Se mudar para `status='agendado'`, exigir `agendamento_id NOT NULL` e que esse agendamento exista.

7. Remover do código frontend a lógica manual de "voltar slot pra livre quando cancela" (passa a ser responsabilidade do banco — fonte única de verdade).

## Server functions

`src/lib/audit.functions.ts` (não acessa secrets diretos no escopo do módulo):

- `logView({ tabela, registro_id, modulo })` — middleware `requireSupabaseAuth`, chama `log_view` RPC com `SET LOCAL app.audit_ip / app.audit_ua / app.audit_modulo`.
- `logAuth({ acao })` — para LOGIN/LOGOUT, chamado no `onAuthStateChange`.
- `listAuditLogs({ filtros, page, pageSize })` — apenas admin (verifica via RPC `has_role`); paginação server-side com `count: 'exact'`; filtros: tabela, ação, módulo, user_id, unidade_id, data_inicio, data_fim, busca livre em `diff::text` via pg_trgm.
- `exportAuditLogs(filtros)` — retorna CSV stream (até 50k linhas; acima disso erro pedindo refinar filtro).

Wrapper `withAuditContext` para todas as server-fn de mutation existentes: faz `SET LOCAL app.audit_ip = $1, app.audit_ua = $2, app.audit_modulo = $3` antes da operação, para que as triggers genéricas capturem contexto.

## Frontend

### Nova rota `src/routes/app.auditoria.tsx`
- Guard: `can("auditoria")` — adicionar módulo no `permissions.ts` (`auditoria`, manageable=false; default só admin).
- **Filtros** topo: período (preset hoje/7d/30d/custom), módulo (multi), ação (multi), usuário (autocomplete), tabela, unidade, busca textual.
- **Tabela paginada** (50/pág, server-side): timestamp · usuário · ação (badge colorido) · módulo · tabela · registro · IP. Linha clicável.
- **Drawer de detalhe**: timeline visual (created_at), antes/depois lado a lado com diff destacado (verde adicionado / vermelho removido / amarelo alterado), metadados (IP, UA, role, unidade).
- **Exportar CSV** (botão respeitando filtros atuais; gera registro `EXPORT` em `audit_logs`).

### Logs de visualização de paciente
Em `app.pacientes.tsx`, ao abrir detalhe → chamar `logView({ tabela:'pacientes', registro_id, modulo:'pacientes' })` (debounced, 1x por sessão por paciente).

### Login/logout
Em `use-auth.tsx`, dentro do `onAuthStateChange`: ao receber `SIGNED_IN` → `logAuth({ acao:'LOGIN' })`; ao `SIGNED_OUT` → `logAuth({ acao:'LOGOUT' })`. Captura UA e (server-side) IP da request.

### Sidebar
Adicionar item "Auditoria" (ícone `ShieldCheck`) sob "Configurações", visível apenas para admin.

## Realtime
`audit_logs` NÃO entra em realtime (ruído + risco de vazamento de PII via canal). Tela usa refetch manual + auto-refresh a cada 30s opcional.

## Compatibilidade
- Migration é aditiva — nenhuma coluna existente alterada/removida.
- Triggers de integridade substituem lógica que hoje vive no app; o app continua funcionando (banco passa a ser autoridade). Onde o frontend já fazia `UPDATE slots set status='livre'` manualmente, viramos no-op (idempotente).
- Índices únicos parciais — preciso rodar `SELECT` antes para detectar duplicidades existentes; caso encontre, migration cancela conflitos antigos para `cancelado` (mesma estratégia já usada na fase da fila).

## Detalhes técnicos resumidos

- Banco: 1 migration grande com tabela, função genérica, ~12 triggers, 2 índices únicos parciais, RLS append-only.
- Backend: 1 arquivo server-fn novo (`audit.functions.ts`), wrapper `withAuditContext` aplicado nas server-fn de mutation existentes.
- Frontend: 1 rota nova (`app.auditoria.tsx`), 1 item de sidebar, 2 hooks de log (`useLogView`, `useLogAuth`), 1 entrada em `permissions.ts`.
- Sem novas dependências npm. Sem secrets novos.

## Critérios de aceite
1. Cancelar um agendamento → slot volta a `livre` automaticamente; se veio da fila, volta a `aguardando`.
2. Tentar criar 2 agendamentos no mesmo slot em paralelo → 1 sucesso, 1 erro `slot_indisponivel` (sem race).
3. Editar status de paciente / fila / agendamento → linha aparece em `/app/auditoria` com diff visual.
4. Login/logout aparecem com IP e user-agent.
5. Não-admin recebe 403 ao acessar `/app/auditoria` ou exportar.
6. Exportar CSV reflete filtros aplicados e gera entrada `EXPORT` no próprio log.

Aprovar este plano para eu executar a Fase 1. Em seguida proponho a Fase 2 (Reagendamento + Encaixe).
