## Problema

O botão **Cotas** mostra "Sem acesso" para `admin@opportunity.com`, e o link **Configurações → Usuários** não aparece na sidebar. A causa é a mesma nos dois casos: esse usuário **não tem o papel `admin`** na tabela `user_roles`. Sem `admin`, o guard `isAdmin || can("cotas","manage")` bloqueia a página, e o item "Configurações" (módulo `usuarios`) fica oculto na sidebar.

O sistema **já tem** a tela de gestão de usuários em `/app/configuracoes/sistema` (com criação, papéis, unidades, permissões por módulo e vínculo de médico). Ela só é visível para quem é `admin`.

## Solução (2 passos)

### 1) Promover `admin@opportunity.com` a admin no banco
Executar migração idempotente:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
  FROM auth.users u
 WHERE u.email = 'admin@opportunity.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Remove papéis não-admin desse usuário pra evitar conflito de defaults
DELETE FROM public.user_roles r
 USING auth.users u
 WHERE r.user_id = u.id
   AND u.email = 'admin@opportunity.com'
   AND r.role <> 'admin';
```

Efeito imediato: `isAdmin=true` no `useAuth`, e a função `can()` retorna `true` para **todos** os módulos (regra já existente em `use-auth.tsx`: `if (isAdmin) return true`). Ou seja, o usuário passa a ver tudo — Cotas, Usuários, Auditoria, Relatórios, etc.

### 2) Verificação pós-migração
- Recarregar a aba (logout/login não é necessário; o `onAuthStateChange` + `loadUserData` recarrega roles).
- Sidebar deve mostrar "Configurações" (que abre `/app/configuracoes/sistema` — a tela de Usuários do sistema).
- `/app/configuracoes/cotas` deve abrir a UI de Cotas normalmente.

## Fora de escopo (não altero agora)

- Não vou mexer em outros usuários; só promovo o admin@opportunity.com. Novos usuários continuam sendo criados como `recepcionista` pela trigger `handle_new_user`, exceto o primeiro (que já vira admin).
- Não vou refatorar permissões nem renomear rotas.
- O item "Configurações" da sidebar aponta para `/app/configuracoes/sistema` (Usuários). O card **Unidades/Especialidades** continua em `/app/configuracoes`. Se você quiser renomear o item da sidebar pra "Usuários" pra ficar mais claro, me avise que eu ajusto num passo extra.

Confirma que rodo a migração?