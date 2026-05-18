## O que está errado / faltando

1. **Médico não sabe quem está em triagem.** Hoje os status `chegou` e `em_triagem` aparecem com badge igual pra todo mundo. O médico precisa ver claramente "Já triado, aguardando você" pra chamar o próximo da fila certo.
2. **Médico chama paciente que ainda está em triagem.** O `ConsultorioDialog` abre/atende independente do status. Tem que bloquear: se o paciente está `em_triagem`, o botão "Atender" precisa estar desabilitado (com tooltip "Aguardando triagem"). Só libera quando a enfermagem finalizar a triagem (status volta a `chegou` ou avança para `confirmado` = "Pronto pra consulta").
3. **Não tem o passo "Triagem finalizada".** Hoje a enfermagem só consegue mover `chegou → em_triagem`. Falta o terceiro botão `em_triagem → triado` (paciente pronto pro médico). Sem isso o médico nunca sabe que pode chamar.
4. **Recepção/sala de espera mal apresentadas.** Tela atual é só uma tabela densa, sem visão de kanban prometida no plano, sem responsivo decente em mobile (overflow horizontal), KPIs sem ícone, ações apertadas.

## O que vou construir

### 1. Novo status `triado` (paciente liberado da triagem, esperando médico)

Adicionar `triado` ao enum `agendamento_status` + coluna `triado_em timestamptz` em `agendamentos`. Trigger `fn_ag_carimbos` carimba quando entra nesse status.

Fluxo final:
```text
agendado/confirmado → chegou → em_triagem → triado → atendido
                       (recep)   (enferm)    (enferm) (médico)
```

`StatusBadge` (em `app.index.tsx`) ganha cor/label nova pro `triado` ("Pronto p/ consulta", verde-âmbar — fica óbvio pro médico).

### 2. Médico só atende quando o paciente está pronto

Em `src/routes/app.agenda-dia.tsx` e no card "Próximos atendimentos" do dashboard:

- Botão **Atender** fica **desabilitado** quando o status é `chegou` ou `em_triagem`, com `title` explicando ("Aguardando recepção"/"Em triagem com a enfermagem").
- Quando o status é `triado` ou `confirmado`/`agendado` (caso a unidade não use triagem), o botão fica **destacado** (pulse leve + cor primária) e o `ConsultorioDialog` abre normalmente.
- Adicionar um banner pequeno no topo da agenda do médico mostrando: "X pacientes prontos pra você atender" (count de `status='triado'` + `profissional_id = meuProf`).

### 3. Enfermagem libera o paciente

Na agenda do dia e na recepção:
- Botão atual `em_triagem → confirmado` vira `em_triagem → triado` (label "Liberar pra consulta", ícone Stethoscope).
- Mantém os botões `Chegou` e `Triagem` como já estão.

### 4. Recepção/Sala de espera repaginadas (`/app/recepcao`)

Reescrita visual (mesma lógica de dados):

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  KPIs (cards com ícone + cor)                                            │
│  [📅 Agendados] [➡ Chegaram] [💉 Em triagem] [✓ Prontos] [🩺 Atendidos] │
├──────────────────────────────────────────────────────────────────────────┤
│  Kanban responsivo (4 colunas em ≥lg, scroll-x em md, stack em sm)       │
│  ┌─────────┬─────────┬─────────┬─────────┐                              │
│  │Aguard.  │Chegou   │Triagem  │Prontos  │                              │
│  │recepção │         │         │/Atendid.│                              │
│  │ (cards) │ (cards) │ (cards) │ (cards) │                              │
│  └─────────┴─────────┴─────────┴─────────┘                              │
│  Cada card: hora · nome · idade · profissional · espera (live)           │
│  Ações inline no card (chegou/triagem/liberar/chamar)                    │
├──────────────────────────────────────────────────────────────────────────┤
│  Filtros + busca (collapse em mobile dentro de Sheet)                    │
│  Tabela detalhada (mantida, com overflow-x e colunas sticky)             │
└──────────────────────────────────────────────────────────────────────────┘
```

Detalhes visuais:
- Cards do kanban com `bg-card`, borda colorida na lateral (sky/violet/amber/emerald conforme coluna), tempo de espera com ícone Clock e cor que fica laranja >20min e vermelha >40min.
- KPIs ganham ícone + label uppercase + número grande, mesma linguagem do dashboard (componente `KPI` já existente).
- Filtros: em mobile (`<md`) escondidos atrás de um botão "Filtros" abrindo um `Sheet` lateral; em desktop ficam inline como hoje.
- Tabela responsiva: wrap em `<div className="overflow-x-auto -mx-3 sm:mx-0">`, fontes menores em mobile, coluna "Ações" vira menu dropdown no mobile.
- Header do `Recepcao` mostra contador "X aguardando você" pro médico logado.

### 5. Painel de chamada (`/painel`) — pequena melhoria

Só impedir que o médico chame paciente em `em_triagem` pelo `ChamarDialog` — desabilitar o atalho de chamar quando status `em_triagem` (na agenda-dia/dashboard, não no painel em si).

## Fora do escopo
- Drag & drop entre colunas do kanban (continua por botão).
- Campos clínicos de triagem (PA, peso, temp) — já estava fora.
- Reescrita do `/painel` em si (só a regra de bloqueio já citada).

## Detalhes técnicos

**Migration:**
```sql
ALTER TYPE agendamento_status ADD VALUE IF NOT EXISTS 'triado';
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS triado_em timestamptz;
-- atualizar fn_ag_carimbos para carimbar triado_em quando status='triado'
```

**Arquivos:**
- `src/lib/permissions.ts` — sem mudança (módulo `recepcao` já existe).
- `src/routes/app.index.tsx` — `StatusBadge` ganha entrada `triado`.
- `src/routes/app.agenda-dia.tsx` — botão Atender condicional (disabled vs destacado), troca `em_triagem → confirmado` por `em_triagem → triado`, banner "X prontos pra você".
- `src/routes/app.recepcao.tsx` — reescrita visual: KPIs com ícones, kanban responsivo de 4 colunas, filtros em Sheet no mobile, mesma lógica de dados + nova coluna "Prontos".
- `src/components/consultorio/consultorio-dialog.tsx` — guard extra: se `status='em_triagem'` no momento de abrir, mostra toast "Paciente ainda em triagem" e fecha. Também ao concluir grava `status='atendido'` (já está).
- `src/integrations/supabase/types.ts` — regenerado pela migration.
