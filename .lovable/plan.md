## Objetivo
Criar a conta **admin@opportunity.com** (senha `Xofome23@`) já confirmada e com papel **admin** — o dono do sistema, com acesso total (cadastros, agendamentos, configurações, gestão de usuários).

## O que será feito

1. **Criar o usuário no backend** via API administrativa do Lovable Cloud:
   - email: `admin@opportunity.com`
   - senha: `Xofome23@`
   - email já confirmado (sem precisar clicar em link)
   - metadata: `nome = "Administrador"`, `cargo = "Admin Master"`

2. **Garantir o papel `admin`** na tabela `user_roles` (caso o trigger `handle_new_user` classifique como recepcionista por já existirem outros usuários, vamos forçar `admin` via migration/insert).

3. **Verificar acesso total**: o papel `admin` já tem, pelas RLS atuais, permissão total em `unidades`, `especialidades`, `profissionais`, `user_roles`, `profiles`, além do CRUD operacional de pacientes/agendas/agendamentos. Nada precisa mudar nas policies — admin já é o "super usuário".

4. **Permitir que esse admin crie novos usuários a partir do próprio sistema**: adicionar uma tela simples em `/app/configuracoes/sistema` (visível só para admin) com formulário "Criar novo usuário" que:
   - cria o usuário no Auth (server function com `supabaseAdmin`)
   - escolhe o papel: **Admin** ou **Recepcionista**
   - já marca email como confirmado
   - lista os usuários existentes com seus papéis e permite alternar/remover papel

## Detalhes técnicos

- O usuário será criado executando um insert administrativo direto no Auth do Cloud (admin API) + insert em `public.user_roles` com `role = 'admin'` (idempotente: `ON CONFLICT DO NOTHING`).
- A nova tela de gestão de usuários vai usar `createServerFn` com `supabaseAdmin` (service role) protegida por checagem de papel admin no handler — recepcionista não consegue chamar.
- Nenhum schema novo é necessário; tudo reusa `profiles` + `user_roles`.

## Fora de escopo (pode vir depois se quiser)
- Recuperação de senha por email
- Logs de auditoria de quem criou cada usuário
- Bloquear/reativar usuários
