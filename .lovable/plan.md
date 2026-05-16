## Status

Integração ponta-a-ponta já tá montada. Não precisa de mudança de código pro teste.

- **Worker** (`spokenmed.meyssiner.workers.dev`): sessão persistida em KV, `/cpf` retornou JSON completo no último teste
- **App** (rota `/app/pacientes`): já existe o botão ✨ ao lado do campo CPF que chama o Worker via `buscarPacienteCpf` (server function em `src/lib/cadsus.functions.ts` → `src/lib/opp-client.server.ts`)
- **Secrets** já configurados: `CADSUS_WORKER_URL` e `CADSUS_WORKER_API_KEY`

## Como testar no app agora

1. Abrir o app (`https://spokenmed.lovable.app` ou preview), fazer login
2. Menu → **Pacientes** → botão **Novo paciente**
3. Digitar o CPF no campo CPF
4. Clicar no botão ✨ (sparkles) ao lado do campo
5. Aparece o spinner; em ~2-5s os campos preenchem sozinhos: **nome, CNS, telefone, logradouro, número, bairro, cidade, UF**

## Comportamento esperado

- Campos vazios → preenchidos com o que veio do worker
- Campos já digitados → **preservados** (a lógica atual não sobrescreve nada que você já tenha mexido)
- CPF inexistente → toast "CPF não encontrado no CadSUS"
- Sessão do Fiorilli expirou → toast "CadSUS indisponível" (aí volta no `/capture` do worker e cola um cURL novo)

## Coisas que NÃO estão no preenchimento atual

Mesmo que o worker devolva, o form hoje **não preenche**:
- `data_nascimento`
- `sexo`
- `nome_mae`
- `cpf` formatado de volta (mantém o que você digitou)

Se quiser que esses também entrem no autofill, me avisa e eu adiciono em 1 linha cada (precisa ajustar o tipo `CadSusResult` em `opp-client.server.ts` que hoje só lista os campos atuais).

## Próximo passo

Você roda o teste e me conta:
- (a) Preencheu certo? Quais campos vieram em branco?
- (b) Quer que eu adicione os campos faltantes (nascimento/sexo/mãe) no autofill?