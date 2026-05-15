## Mostrar mais dados na listagem da Fila

Hoje cada item da fila exibe só: nome, especialidade, CPF (parcial) e urgência. O usuário quer ver também **data de nascimento** e **unidade**, deixando os dados de origem do paciente bem visíveis.

### Mudanças em `src/routes/app.fila.tsx`

1. **Buscar mais campos do paciente e unidade no SELECT da query da fila**
   - Adicionar `data_nascimento` ao select de `pacientes`.
   - Adicionar relação `unidades(id, nome)` ao select.

2. **Atualizar o item da lista** (bloco em torno das linhas 277–292) para mostrar uma linha de metadados rica:
   - Nome (mantém)
   - Badge de urgência (mantém)
   - Linha de detalhes em grid/wrap:
     - **Especialidade:** `f.especialidades?.nome`
     - **Unidade:** `f.unidades?.nome`
     - **CPF:** `formatCPF(f.pacientes?.cpf)`
     - **Nascimento:** `formatDate(f.pacientes?.data_nascimento)` + idade calculada
   - Manter "tempo na fila" e observações como já estão.

3. **Atualizar também o diálogo de remover** (linhas 370–375) para incluir Unidade e Nascimento, já que reutiliza o mesmo objeto.

4. **Importes**: adicionar `formatDate` de `@/lib/format` (já existe). Helper local pequeno para idade a partir de `data_nascimento`.

### Fora de escopo
- Sem mudanças de backend / RLS (a coluna `data_nascimento` já existe em `pacientes` e `unidades.nome` já é selecionável pelo staff).
- Sem mudanças na lógica de ordenação/posição da fila.
