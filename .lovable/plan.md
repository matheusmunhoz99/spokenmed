## Ajustes na tela de Pacientes + busca CadSUS

Arquivo: `src/routes/app.pacientes.tsx`

### 1. Trazer mais campos do retorno CadSUS
O server function já retorna `data_nascimento`, `nome_mae`, `sexo`, `cns_secundario`, etc., mas o `setForm` em `handleBuscarCadSus` ignora vários. Incluir:
- `data_nascimento` (converter de `dd/mm/aaaa` para `yyyy-mm-dd` para o `<input type="date">`)
- `nome_mae`
- `sexo` (já vem `M`/`F`)
- `cep` (quando vier)

### 2. Sobrescrever campos ao buscar novo CPF
Hoje o código preserva o valor digitado (`f.nome?.trim() ? f.nome : dados.nome`). Mudar a regra: **quando o usuário clica em "Buscar CadSUS", os dados retornados substituem todos os campos correspondentes** (nome, cns, telefone, endereço completo, nascimento, sexo, nome_mae). Assim, buscar um CPF e depois outro troca os dados corretamente. CPF digitado e observações ficam intactos.

### 3. Limpar formulário ao fechar o dialog sem salvar
O state `form` no `PacienteDialog` persiste porque o componente não desmonta entre aberturas (Radix mantém em árvore). Soluções combinadas:
- Adicionar `key` no `<PacienteDialog>` baseado em `editing?.id ?? "novo-" + open` para forçar remount a cada abertura.
- Alternativa mais limpa: no `<Dialog onOpenChange>`, ao fechar, zerar `editing` e usar `key={open ? (editing?.id ?? "novo") : "closed"}` para garantir reset.

### 4. Botão "Buscar CadSUS" mais profissional
Hoje é um `Button variant="outline" size="icon"` com ícone `Sparkles` (parece template Lovable). Substituir por:
- Botão com largura automática, variante `default` (primary) ou `secondary`, ícone `IdCard` ou `UserSearch` do lucide + texto curto **"CadSUS"**.
- Estado loading mantém spinner.
- Tooltip já existente (`title`) preservado, com microcopy "Importar dados do cidadão pelo CadSUS".
- Ajustar layout do campo CPF para `flex gap-2` ficar visualmente equilibrado (input flex-1 + botão fixo).

### 5. Polimento profissional adicional (escopo mínimo)
- Após sucesso do CadSUS, manter o toast "Dados do CadSUS importados" (mais claro que "preenchidos").
- Garantir que `cpfErro` é limpo após import bem-sucedido.

### Fora de escopo
- Não mexer no worker Cloudflare (já está funcionando).
- Não alterar schema do banco.
- Sem mudanças no fluxo de salvar/edit.

Posso seguir e implementar?