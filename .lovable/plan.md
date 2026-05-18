## Diagnóstico

O reposicionamento do CPF como primeiro campo (commit `04ac6f9`) foi **apenas UI** — o `handleBuscarCadSus` e o `useEffect` de auto-disparo continuam idênticos ao código anterior que funcionava. O sintoma confirmado pelo usuário ("toast 'CPF não encontrado no CadSUS' ou erro de sessão") indica que **o Worker do CadSUS está sendo chamado**, mas devolve `cpf_nao_encontrado` ou `sessao_ausente/expirada` porque o login Fiorilli expirou.

A correção real é renovar a sessão em `/capture`. Mas como o erro vai se repetir toda vez que a sessão cair, vale melhorar a UX para o operador entender e resolver sozinho.

## Mudanças

### 1. Toast com ação direta para `/capture`
Em `src/routes/app.pacientes.tsx`, no `handleBuscarCadSus`, quando `r.error` for `sessao_ausente` ou `sessao_expirada`, trocar o `toast.error` simples por um `toast.error` com `action` que abre `/capture` em nova aba. O operador renova a sessão e refaz a busca clicando em "Buscar CadSUS".

### 2. Banner de status da sessão CadSUS no topo do diálogo
Adicionar uma chamada leve a `cadsus-diag.functions.ts` (ou novo `cadsusSessionStatus` serverFn que consulta `${CADSUS_WORKER_URL}/health` ou `/session`) ao abrir o diálogo de "Novo paciente". Se a sessão estiver caída, mostrar uma faixa âmbar **antes** do hero do CPF: "Sessão CadSUS expirou — renove em /capture para preencher automaticamente". Evita o operador digitar o CPF inteiro só para descobrir que está fora.

### 3. Re-tentativa automática em `cpf_nao_encontrado` quando suspeito
Hoje, se a sessão acabou de cair, o Worker às vezes devolve `cpf_nao_encontrado` em vez de `sessao_expirada` (depende de onde a página Fiorilli quebrou). Adicionar lógica: se o usuário recebeu `cpf_nao_encontrado` mas a última verificação de sessão foi há mais de 5 min, sugerir no próprio toast renovar a sessão antes de afirmar que o CPF não existe.

### 4. Distinção clara no toast
Hoje a mensagem para `cpf_nao_encontrado` é apenas "CPF não encontrado no CadSUS." Trocar por algo que diga também: "Se acabou de cadastrar o CPF no Fiorilli, renove a sessão." — reduz suporte.

## Arquivos alterados

- `src/routes/app.pacientes.tsx` — toast com `action`, banner de sessão, mensagem refinada
- (opcional) `src/lib/cadsus.functions.ts` — adicionar `cadsusSessionStatus` que faz GET ao Worker e devolve `{ ok: boolean, expiresInSec?: number }`

## O que NÃO vai mudar

- Lógica de auto-disparo ao bater 11 dígitos (já correta)
- Ordem dos campos (CPF continua no topo)
- `findDuplicate` antes do CadSUS (já é a regra para economizar consulta)

## Próximo passo imediato (antes do código)

Abra `/capture`, refaça login Fiorilli, volte ao cadastro e teste o mesmo CPF. Se preencher: estava só sessão e o plano acima previne reincidência. Se ainda não preencher: investigamos o Worker (logs do Cloudflare Worker em `CADSUS_WORKER_URL`).
