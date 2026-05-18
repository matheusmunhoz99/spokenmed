
## Objetivo

1. No formulário de paciente, ao digitar o CPF e pressionar **Enter**, disparar a busca do CadSUS automaticamente (sem mover foco para o campo Nome e sem submeter o formulário).
2. Melhorar a rotina geral de foco/tabulação dos diálogos de cadastro e busca para ficar previsível.

## Mudanças

### 1. CPF — Enter dispara CadSUS (principal)

Arquivo: `src/routes/app.pacientes.tsx` (campo CPF, linhas ~443-465)

- Adicionar `onKeyDown` no `<Input>` do CPF:
  - Se `e.key === "Enter"`: `e.preventDefault()` + `e.stopPropagation()` e chamar `handleBuscarCadSus()`.
  - Isso impede o submit implícito do `<form>` (que hoje aciona o botão padrão e bagunça o foco) e evita o "salto" pro campo Nome.
- Após o sucesso do `handleBuscarCadSus`, mover foco automaticamente para o próximo campo lógico (telefone) ou manter no CPF se houver erro — ver item 3.

### 2. CEP — mesmo padrão

Arquivo: `src/routes/app.pacientes.tsx` (campo CEP, linhas ~476-486)

- Adicionar `onKeyDown` Enter → `preventDefault` + chamar `handleCepBlur()` e em seguida mover foco para o campo **Número** (`data-field="numero"` já existe).
- Hoje o Enter no CEP também submete o form.

### 3. Form não submete por Enter em campos isolados

Arquivo: `src/routes/app.pacientes.tsx` no `<form onSubmit=...>`

- Adicionar handler global `onKeyDown` no `<form>`: se `Enter` em `<input>` (não textarea, não botão), `e.preventDefault()`. O envio passa a ser exclusivamente pelo botão "Cadastrar/Salvar" no rodapé.
- Isso elimina envios acidentais e a "volta de foco" pra primeira coisa focável (que hoje é o Nome).

### 4. Tabulação previsível no diálogo de paciente

Arquivo: `src/routes/app.pacientes.tsx`

- Garantir ordem natural do DOM já bate com a ordem visual (Nome → Nascimento → Sexo → Mãe → CPF → CNS → RG → Telefone → ...). Hoje já está OK, só revisar se algum botão "CadSUS" precisa de `tabIndex={-1}` para não interromper o fluxo Tab (eu vou pra CNS direto, sem parar no botão).
- Acrescentar `tabIndex={-1}` no botão CadSUS.

### 5. Foco inicial ao abrir o diálogo

- Quando o diálogo abre em modo **novo cadastro**: foco no campo Nome (já é o comportamento padrão do shadcn dialog, manter).
- Quando abre em modo **edição**: foco no botão "Salvar alterações" não — manter no Nome também é OK; sem mudança a menos que necessário.

### 6. Busca da listagem de pacientes — Enter já funciona

- Confirmar que `/` (atalho global) foca o campo de busca (já implementado em `use-shortcuts.tsx`).
- Sem mudança.

## Arquivos tocados

- `src/routes/app.pacientes.tsx` — único arquivo de código.

## Fora de escopo (a confirmar depois)

- Diálogos de **agendamento**, **encaixe**, **reagendar**, **consultório** — me avise se quiser que eu aplique o mesmo padrão de Enter/Tab nesses também; faço numa segunda rodada para não inchar este passo.

## Como você testa

1. Abrir Pacientes → "Novo paciente".
2. Preencher Nome, Nascimento, ir até o CPF, digitar 11 dígitos, pressionar **Enter** → CadSUS dispara, dados preenchem, foco vai pro Telefone.
3. Em qualquer campo de texto, pressionar Enter → nada é submetido; só o botão do rodapé envia.
4. No CEP, digitar e dar Enter → endereço preenche e foco vai pro Número.
