
## Objetivo

Centralizar a criação de usuários **apenas no admin**. Remover o auto-cadastro do login. Permitir 3 perfis (Administrador, Administrativo/Recepção, Médico) e, dentro de cada usuário, o admin escolhe **quais módulos ele enxerga e o que pode fazer** (ver / gerenciar).

---

## 1. Login — remover auto-cadastro

`src/routes/login.tsx`:
- Remover as `Tabs` e a aba "Criar conta" inteira (form, handler `handleSignUp`, import).
- Trocar o `CardDescription` para "Acesso restrito. Sua conta é criada pelo administrador."
- Manter apenas o formulário de login.
- Esconder também o botão de signUp do `useAuth` (manter no contexto, só não usar).

> Observação: o trigger `handle_new_user` continua criando o **primeiro** usuário como admin automaticamente (bootstrap inicial). Isso fica intacto, mas como não há mais tela de signup, o primeiro admin será criado pelo Lovable Cloud → Users na primeira vez. Vou manter um comentário no código explicando isso.

---

## 2. Banco — adicionar perfil "Médico" + permissões granulares

Migration:

```text
- ALTER TYPE app_role ADD VALUE 'medico'
- CREATE TABLE public.user_permissions (
    user_id uuid,
    module  text,        -- 'agenda_dia' | 'agendar' | 'pacientes' |
                         -- 'profissionais' | 'agendas' |
                         -- 'unidades_especialidades' | 'usuarios'
    can_view    boolean default false,
    can_manage  boolean default false,
    PRIMARY KEY (user_id, module)
  )
- RLS: só admin lê/escreve; cada user lê o próprio (SELECT self).
- Função SECURITY DEFINER  has_permission(_user, _module, _action)
  -> admin sempre true; senão consulta user_permissions.
- Defaults aplicados na criação do usuário (server fn), conforme o papel:
    admin            -> todos os módulos, view+manage
    administrativo   -> agenda_dia, agendar, pacientes (view+manage);
                        profissionais, agendas (view)
    medico           -> agenda_dia (view), pacientes (view)
- Vincular médico a um profissional: adicionar coluna
    profissionais.user_id uuid NULL  (1:1 opcional)
  para que o médico veja só a própria agenda.
```

(Sem mexer em RLS já existente das outras tabelas — o controle vai ser feito no front por enquanto, conforme o usuário pediu "o que a pessoa pode ver ou não". RLS continua garantindo o limite por unidade.)

---

## 3. Server functions — `src/lib/admin-users.functions.ts`

Atualizar:
- `createSystemUser`: aceitar `role: 'admin' | 'administrativo' | 'medico'` (renomear `recepcionista`→`administrativo` no enum lógico, mas mantendo compatibilidade — usar 'recepcionista' como valor do app_role para não quebrar dados; rótulo na UI = "Administrativo"). Também aceitar `profissional_id?: string` opcional para vincular médico.
- Após criar: inserir defaults em `user_permissions` conforme tabela acima.
- `updateUserRole`: ao mudar papel, **resetar** `user_permissions` para o default do novo papel.
- Novas fns:
  - `getUserPermissions({ user_id })` → lista de módulos e flags.
  - `setUserPermissions({ user_id, perms: [{module, can_view, can_manage}] })`.
  - `linkMedicoProfissional({ user_id, profissional_id | null })`.

---

## 4. Hook `useAuth`

`src/hooks/use-auth.tsx`:
- Carregar também `permissions: Record<string, {view:boolean; manage:boolean}>` do usuário logado.
- Expor helpers:
  - `can(module, action='view'|'manage')` — admin sempre true.
  - `isMedico`, `isAdministrativo` (derivados).

---

## 5. Sidebar e rotas — esconder o que não pode ver

`src/components/app-sidebar.tsx`:
- Filtrar cada item por `can(module, 'view')`.
- "Unidades & Especialidades" e "Configurações" continuam só pra admin.

`src/components/mobile-bottom-nav.tsx`: mesmo filtro.

Cada rota protegida (`app.agenda-dia.tsx`, `app.agendar.tsx`, `app.pacientes.tsx`, `app.profissionais.tsx`, `app.agendas.tsx`) recebe um pequeno guard no topo:
```text
if (!can('modulo', 'view')) return <SemAcesso />
```
Botões de criar/editar/excluir são escondidos quando `!can(modulo, 'manage')`.

Para o **médico**, a rota `agenda-dia` filtra por `profissional_id = profissional vinculado ao user`.

---

## 6. Painel de Usuários (`app.configuracoes.sistema.tsx`)

- Select de perfil: **Administrador / Administrativo / Médico**.
- Quando "Médico": mostrar select de "Vincular a profissional cadastrado" (lista de `profissionais` ativos sem user_id).
- Cada linha da tabela ganha um botão **"Permissões"** que abre um Dialog com uma matriz:

```text
Módulo                     | Ver | Gerenciar
---------------------------|-----|----------
Painel                     |  ☑  |    —
Agenda do dia              |  ☑  |    ☑
Agendar consulta           |  ☑  |    ☑
Pacientes                  |  ☑  |    ☑
Profissionais              |  ☑  |    ☐
Agendas (config)           |  ☐  |    ☐
Unidades & Especialidades  |  ☐  |    ☐
Usuários do sistema        |  ☐  |    ☐
```

- Admin: matriz desabilitada (tudo marcado).
- Botão "Restaurar padrão do perfil".
- Salva via `setUserPermissions`.

---

## 7. Página inicial (Painel) — sem botão de cadastro

Confirmar `src/routes/app.index.tsx` e `src/routes/index.tsx`: já não há botão de "Cadastrar". O botão "Criar conta" do login é o que será removido (item 1). Nada mais a fazer aqui.

---

## Arquivos afetados

**Editar:**
- `src/routes/login.tsx`
- `src/hooks/use-auth.tsx`
- `src/components/app-sidebar.tsx`
- `src/components/mobile-bottom-nav.tsx`
- `src/lib/admin-users.functions.ts`
- `src/routes/app.configuracoes.sistema.tsx`
- `src/routes/app.agenda-dia.tsx`, `app.agendar.tsx`, `app.pacientes.tsx`, `app.profissionais.tsx`, `app.agendas.tsx`, `app.configuracoes.tsx` (guards + esconder botões de manage)

**Criar:**
- `src/components/sem-acesso.tsx` (tela amigável de "sem permissão")
- `src/components/permissions-dialog.tsx`

**Migration:** novo enum value, tabela `user_permissions`, função `has_permission`, coluna `profissionais.user_id`.
