# Auto-preenchimento no cadastro de paciente

## 1. CEP → endereço (ViaCEP) ✅

**O quê:** ao digitar o CEP no diálogo de paciente (`src/routes/app.pacientes.tsx`), buscar automaticamente logradouro, bairro, cidade e UF e preencher os campos. Usuário pode editar tudo depois.

**Como:**
- Novo helper `src/lib/viacep.ts` com `fetchCep(cep: string)` chamando `https://viacep.com.br/ws/{cep}/json/`. Tratamento: timeout 5s (`AbortController`), trata `{erro: true}` como "não encontrado", silencioso em falha de rede.
- No `PacienteDialog`, adicionar `onBlur` no input de CEP: se tiver 8 dígitos e os campos de endereço estiverem vazios (não sobrescrever o que o usuário digitou), preencher logradouro/bairro/cidade/uf e mover foco para "Número".
- Indicador visual leve (spinner pequeno dentro do input) enquanto busca.
- Toast discreto se CEP não encontrado; nada se sucesso (preenchimento já é o feedback).

**Por que ViaCEP e não BrasilAPI:** ViaCEP é o padrão de fato no Brasil, mais rápido para CEPs comuns, sem rate limit problemático. Sem chave, sem backend, sem segredo.

## 2. CPF → validação local ✅

**O quê:** validar o CPF pelos dígitos verificadores (algoritmo módulo 11) ao sair do campo. Mostrar erro inline se inválido. **Não consulta nada externo.**

**Como:**
- Adicionar `isValidCPF(cpf: string)` em `src/lib/format.ts` (algoritmo padrão).
- No campo CPF do `PacienteDialog`: `onBlur` valida e mostra mensagem vermelha embaixo se inválido. Não bloqueia o submit (alguns cadastros antigos podem ter CPF errado e a recepcionista pode querer salvar mesmo assim com aviso).

## 3. CadSUS — não fazer ❌

Documentar no plano por quê (acima). Se a prefeitura conseguir certificado ICP-Brasil + acesso oficial ao barramento CNS futuramente, aí sim implementamos via server function.

## Fora de escopo
- Consulta de CPF na Receita (paga — Serpro/Assertiva)
- Qualquer integração com CADSUSWeb por scraping
- Mudanças no schema do banco (campos já existem)
- Mudanças em outras telas além de `app.pacientes.tsx`

## Arquivos afetados
- **Criar:** `src/lib/viacep.ts`
- **Editar:** `src/lib/format.ts` (adicionar `isValidCPF`)
- **Editar:** `src/routes/app.pacientes.tsx` (onBlur CEP + validação CPF)
