## O que está errado hoje

1. **Botão "Atender" só aparece pro email `admin@opportunity.com`** — o código usa `isMedicoSimulado = user?.email === "admin@opportunity.com"`. Dr. Carlos (médico real) nunca vê o botão. Vale trocar pela role `medico` de verdade.
2. **Existe um botão "Atendido" (UserCheck) que muda o status manualmente** — precisa sumir. O status `atendido` só pode ser gravado quando o médico finalizar a consulta no consultório (SOAP + CID + conduta).
3. **Não existe controle de chegada / triagem** — recepcionista não tem onde marcar "paciente chegou", enfermagem não tem onde marcar "triado", e não há painel mostrando ordem de chegada.

## O que vou construir

### 1. Botão "Atender" para todo médico (agenda do dia)
- Remover a gambiarra `isMedicoSimulado`; usar `isMedico` do `useAuth`.
- Mostrar o botão **Atender** (abre o `ConsultorioDialog`) em **qualquer linha da agenda do dia** quando o usuário for médico **e** o agendamento for dele (`profissional.user_id === user.id`), com status diferente de `cancelado`/`atendido`.
- Mesma regra aplicada na lista de "Próximos agendamentos" do dashboard `/app` (é a outra "agenda" que o médico vê hoje).

### 2. Status "atendido" 100% automático
- Remover o botão UserCheck "Atendido" da agenda do dia.
- Ao concluir `finalizar()` no `ConsultorioDialog` (depois do envio eSUS), fazer `UPDATE agendamentos SET status='atendido', atendido_em=now() WHERE id=...` e invalidar as queries de agenda/recepção.
- Manter os botões de **Confirmar / Faltou / Cancelar** (esses continuam manuais, são da recepção).

### 3. Novos estados de fluxo do dia
Adicionar dois valores ao enum `agendamento_status`:
- `chegou` — recepcionista bateu a chegada
- `em_triagem` — enfermagem chamou pra triagem

Adicionar colunas em `agendamentos`:
- `chegou_em timestamptz` (carimbo da chegada — base da ordem)
- `triagem_em timestamptz`
- `atendido_em timestamptz`
- `triagem_por uuid` (quem triou)
- Trigger para preencher cada carimbo quando o status muda pro respectivo valor.

### 4. Nova tela **Recepção do dia** (`/app/recepcao`)
Visão única que a recepcionista e a enfermagem usam o dia inteiro. Layout em 4 colunas (kanban) + tabela com filtros embaixo:

```text
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Aguardando   │ Chegou       │ Em triagem   │ Atendidos    │
│ recepção (N) │ (N) ⏱ tempo  │ (N) ⏱ tempo  │ (N)          │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ [Marcar      │ [Chamar p/   │ [Liberar p/  │ Histórico    │
│  chegada]    │  triagem]    │  atendimento]│ do dia       │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

Cabeçalho com contadores ao vivo: **Agendados · Chegaram · Triados · Atendidos · Faltaram**.

Tabela detalhada abaixo com:
- Ordem (1, 2, 3… pela ordem de chegada — `chegou_em` ASC)
- Hora marcada · Paciente · Idade · Profissional · Status · Tempo de espera (live)
- **Filtros**: por status, por unidade, por profissional
- **Ordenação**: ordem de chegada (default), nome, idade, hora marcada
- **Busca**: nome ou CPF
- Botão de **chamar no painel** continua disponível em cada linha

Atualização em tempo real via Supabase Realtime na tabela `agendamentos`.

### 5. Permissões
- Novo módulo `recepcao` no enum de permissões.
- Default por papel:
  - `recepcionista` → view + manage (é o painel principal dela)
  - `medico` → view (acompanhar quem chegou)
  - `admin` → tudo
- Item no sidebar "Recepção do dia" pra quem tem `can("recepcao")`.

## Detalhes técnicos

- **Migration** (alter enum + colunas + trigger + RLS herda das policies existentes de `agendamentos`):
  ```sql
  ALTER TYPE agendamento_status ADD VALUE 'chegou';
  ALTER TYPE agendamento_status ADD VALUE 'em_triagem';
  ALTER TABLE agendamentos
    ADD COLUMN chegou_em timestamptz,
    ADD COLUMN triagem_em timestamptz,
    ADD COLUMN atendido_em timestamptz,
    ADD COLUMN triagem_por uuid;
  -- trigger fn_ag_carimbos: preenche *_em quando status muda
  ```
- **Front**:
  - `src/routes/app.recepcao.tsx` (nova rota + guard `can("recepcao")`)
  - `src/routes/app.agenda-dia.tsx`: trocar gate do botão Atender; remover botão "Atendido"
  - `src/components/consultorio/consultorio-dialog.tsx`: ao finalizar, gravar `status='atendido'` no banco
  - `src/lib/permissions.ts` + `src/lib/admin-users.functions.ts`: adicionar módulo `recepcao`
  - `src/components/app-sidebar.tsx` + `src/components/mobile-bottom-nav.tsx`: novo item
  - `src/components/ui/StatusBadge` (`app.index.tsx`): cores pros novos status

- **Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE agendamentos;` (se ainda não estiver) e subscribe na rota recepção.

## Fora do escopo (avisar)
- App separado pra enfermagem/triagem (campos de PA, peso, temperatura na triagem) — hoje a tela só marca o status; SOAP completo é com o médico no consultório.
- Senha automática de chamada por especialidade (continua chamando pelo nome via painel atual).
