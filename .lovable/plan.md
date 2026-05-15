## Status atual

**Bug crítico já corrigido na mensagem anterior:** funções `private.user_can_access_unidade`, `user_can_see_profissional` e `has_permission` chamavam `public.has_role` (que não existe — só existe em `private`). Isso quebrava praticamente tudo para usuários não-admin (cadastro de profissionais, agendas, fila, anexos).

**Verificações automáticas que acabei de rodar:**

- Linter Supabase: nenhum erro novo (os 6 warnings são funções intencionalmente públicas/admin já validadas internamente)
- Nenhuma outra função no banco referencia `public.has_role`/`public.is_authenticated_staff`/etc.
- Todas as chamadas `.rpc(...)` no frontend apontam para funções existentes (`gerar_slots`, `log_view`, `log_auth`, `log_export`, `cidadao_consultar`)
- 2 usuários no sistema: `admin@opportunity.com` (admin) e `m.gomesscouto@gmail.com` (recepcionista)

## O que preciso de você para o teste tela-a-tela

A sessão do navegador da minha ferramenta **não compartilha** o login do seu preview — é uma sessão Chrome separada. Para entrar no `/app` preciso da **senha do `admin@opportunity.com**`.

Como prefere que eu prossiga?

## Plano de teste (quando tiver a senha)

Vou rodar este roteiro como `admin`, capturando print + log de console + log de rede em cada etapa, e parando IMEDIATAMENTE para corrigir qualquer erro encontrado:

**1. Cadastros (Admin)**

- Criar uma Unidade
- Criar um Profissional vinculado a essa unidade (o bug que você reportou)
- Criar uma Especialidade e um Procedimento
- Criar uma Agenda + gerar slots (`gerar_slots`)

**2. Operação (Recepcionista)**

- Cadastrar um Paciente novo (validando sanitização CPF/CNS)
- Agendar paciente em um slot
- Reagendar (deve liberar slot anterior)
- Cancelar (deve liberar slot e voltar fila)
- Criar encaixe (sem slot, com justificativa)
- Adicionar à Fila de Espera + vincular a agendamento
- Anexar documento ao agendamento

**3. Painel / Atendimento**

- Chamar paciente (insere em `chamadas`, dispara realtime)
- Verificar painel `/painel` recebendo o evento

**4. Cidadão (público, sem login)**

- Consultar com CPF + código válido → ver dados
- Consultar com código errado 11x → validar rate limit (P0010)

**5. Auditoria & Permissões (Admin)**

- Visualizar tela de Auditoria (logs gerados pelos passos acima)
- Visualizar Permissões/Usuários, atribuir módulo a recepcionista
- Trocar de usuário e validar que vê só o que tem permissão

**6. Login**

- Logout/login (gerar log_auth)
- Forçar 3 falhas e ver throttle progressivo

## Tipos de bugs que vou caçar

- Mensagens de erro técnicas vazando para usuário (ex.: códigos PostgreSQL crus)
- Estados de loading travados / queries que não invalidam
- Form sem validação client-side suficiente
- Botões que não dão feedback (toast) após ação
- Layouts quebrados em desktop 1399px (viewport atual)
- Race conditions em mutations sequenciais (delete + insert em `profissional_unidades`)
- Permissões mostrando opções que o usuário não pode executar
- Realtime que não atualiza sem refresh

## Alternativas se você não quiser passar a senha

A. Eu **reseto a senha do admin** via SQL (gera senha temporária, te entrego, você troca depois)
B. Você cria um **usuário de teste** novo (`teste@spokenmed.local` / senha simples) só pra eu usar, e depois deleta
C. Eu testo apenas os fluxos públicos (`/`, `/cidadao`, `/painel/<unidade>`) que não exigem login

Me diga qual e seguimos.  
  
use [admin@opportunity.com](mailto:admin@opportunity.com) senha Xofome23@ ja tem criado