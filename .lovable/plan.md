## Pacientes: busca preguiçosa + prevenção de duplicados

Arquivo: `src/routes/app.pacientes.tsx`

### 1. Não listar todos os pacientes ao abrir
- Mudar a query para **só rodar quando houver termo de busca** (≥ 2 caracteres). Usar `enabled: search.trim().length >= 2` no `useQuery`.
- Manter o debounce simples (300ms) no input para evitar disparar a cada tecla.
- Estado inicial da tela (sem busca): mostrar um `EmptyState` simpático com ícone `Search`, título "Comece a buscar" e descrição "Digite nome, CPF, CNS ou telefone para localizar um paciente." + botão "Novo paciente" do lado.
- Buscar continua igual: `nome` (ilike) ou `cpf/cns/telefone` (digits ilike). Limite 50 resultados (em vez de 200) já que é busca direcionada.

### 2. Prevenção de duplicados ao salvar (novo paciente)
Antes de fazer o `insert`, rodar duas verificações em paralelo no Supabase:

- **CPF igual**: `select id, nome from pacientes where cpf = :cpf_digits limit 1` (só se CPF preenchido).
- **Nome + Nascimento iguais**: `select id, nome from pacientes where lower(unaccent(nome)) = lower(unaccent(:nome)) and data_nascimento = :data limit 1` (só se ambos preenchidos).

Se qualquer um retornar match → abrir um `AlertDialog` com:
- Título: "Paciente já cadastrado"
- Mensagem: explicando o que bateu ("CPF já consta em **NOME EXISTENTE**" ou "Já existe **NOME** com a mesma data de nascimento").
- Ações: **"Editar existente"** (fecha o dialog de novo, abre o de edição com o paciente encontrado) e **"Cancelar"**.

Implementação: como `unaccent` requer extensão, fazer normalização no client (lowercase + trim) e comparar com `ilike` exato: `nome.ilike.NOME_NORMALIZADO`. Aceitável para esse caso. Sem migration.

Pular essa checagem quando `editing` está definido (já é edição).

### 3. Prevenção de duplicados ao buscar no CadSUS
No `handleBuscarCadSus`, **antes de chamar o server function**, consultar `pacientes where cpf = :cpf_digits`. Se já existir:
- Mostrar `AlertDialog`: "Paciente já cadastrado no sistema — **NOME**. Deseja abrir o cadastro existente para editar?"
- Ações: **"Abrir existente"** (fecha o dialog atual, abre o de edição com o paciente encontrado) e **"Cancelar"**.
- Se cancelar, não chama o CadSUS (evita gastar consulta no Fiorilli e evita sobrescrever).

### 4. UX / polimento
- Estado de loading do botão "Salvar" mostra spinner durante a checagem de duplicados também.
- Mensagens de toast claras.
- Manter o reset do form ao fechar (já implementado).
- Acessibilidade: `AlertDialog` do shadcn com foco no botão primário ("Editar existente").

### Estrutura técnica
- Adicionar `useDebouncedValue` (hook local simples com `useEffect` + `setTimeout`) ou usar `useState` + `setTimeout` direto. Sem nova dependência.
- Novo state `duplicateModal`: `{ open: boolean; mode: 'save' | 'cadsus'; paciente: { id, nome }; reason: string }`.
- Função utilitária `checkDuplicates(form)` que retorna o paciente conflitante ou null.
- Ao clicar "Editar existente": fechar o dialog atual, chamar `openEdit(paciente)` no componente pai (precisa expor via prop `onOpenExisting`).

### Fora de escopo
- Sem alterações no banco / migrations.
- Sem mexer no worker Cloudflare.
- Sem mudar a lógica de CSV / lista (a tabela continua existindo, só não carrega de cara).