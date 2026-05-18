## Objetivo

Tornar obrigatório que toda visita seja vinculada a um **paciente que pertença a uma família** cadastrada em um **domicílio** (com microárea/área), e oferecer a opção de **replicar a visita para todos os membros da família** ao salvar.

## Mudanças

### 1. Fluxo da tela `/app/visitas/nova`

Substituir a busca livre de paciente por um seletor em 3 passos:

1. **Selecionar Domicílio** — busca/lista dos domicílios cadastrados pelo ACS (próprios, via RLS). Cada item mostra logradouro/nº, bairro, microárea e nº de famílias. Botão "Cadastrar novo domicílio" → `/app/domicilios/novo`.
2. **Selecionar Família** — lista das famílias do domicílio escolhido. Mostra responsável e nº de membros.
3. **Selecionar Paciente (membro)** — lista somente os membros da família selecionada (`familia_membros` → `pacientes`). Sem busca livre por CPF/nome solto.

Se o domicílio não tiver família, ou a família não tiver membros, mostrar aviso com link para editar o domicílio.

Endereço da visita passa a ser pré-preenchido com o endereço do domicílio (e GPS sugerido a partir das coordenadas salvas, mas ainda obrigatória a captura no momento da visita).

### 2. Replicar visita para a família

Antes de salvar, se a família tiver 2+ membros, mostrar um `AlertDialog`:

> "Replicar esta visita para todos os **N** membros da família?"
> Botões: **Sim, replicar para todos** / **Não, apenas para [nome do paciente]**.

- **Não** → comportamento atual: 1 insert em `visitas_domiciliares` para o paciente selecionado.
- **Sim** → 1 insert por membro da família, todos com os mesmos campos da visita (data, turno, motivos, acompanhamentos, GPS, fotos, observações, etc.) e mesma assinatura/recusa. Cada registro fica individual (auditável separadamente), todos vinculados ao mesmo `domicilio_id` e `familia_id`.

Toast final: "Visita registrada para N pacientes."

### 3. Banco

Tornar `domicilio_id` e `familia_id` **NOT NULL** em `visitas_domiciliares` (após o backfill: como ainda não há visitas com esses campos preenchidos em produção, basta um check — se houver linhas antigas sem domicílio, deixar nullable e validar apenas no frontend; confirmo durante a migração).

Plano seguro: validar **no frontend** que `domicilio_id` e `familia_id` são obrigatórios na criação, **sem** alterar a coluna (mantém visitas antigas válidas).

### 4. Permissões

Sem mudanças — ACS já tem `manage` em `visitas` e `domicilios`.

## Arquivos

- **editar** `src/routes/app.visitas.nova.tsx` — novo seletor domicílio→família→paciente, dialog de replicação, loop de inserts.
- **(opcional) novo** `src/components/visita-replicar-dialog.tsx` — extrair o AlertDialog se ficar grande.

## Pontos técnicos

- Buscar domicílios do ACS: `domicilios` filtrado por `acs_user_id = auth.uid()` (RLS já garante).
- Buscar famílias: `familias.select('*, familia_membros(paciente_id, parentesco, is_responsavel, pacientes(id, nome, cpf, data_nascimento))').eq('domicilio_id', selectedDomicilio.id)`.
- Replicação: `Promise.all(membros.map(m => supabase.from('visitas_domiciliares').insert({...payload, paciente_id: m.paciente_id})))`. Upload das fotos acontece **uma única vez**; os metadados são reaproveitados em todos os inserts.
- Assinatura: a mesma assinatura do responsável é replicada para os registros dos demais membros (PEC permite — responsável familiar assina pela família). Manter campo `assinatura_recusada` igual em todos.
