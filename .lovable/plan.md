## Diagnóstico

Rodei o scanner do Supabase + análise de segurança Lovable. Achados:

**Banco (12 warns Supabase + 3 lov):**
1. `pg_trgm` instalada no schema `public` (deveria ficar em `extensions`).
2. 11 funções `SECURITY DEFINER` com EXECUTE para `authenticated` / `anon` que não precisam ser expostas via PostgREST: `gen_agendamento_codigo`, `set_audit_context`, `fn_audit_row`, `fn_ag_*` (triggers), `handle_new_user`, `set_updated_at`, `gerar_slots`, `log_view`, `log_export`, etc. Funções de trigger não devem ter EXECUTE para usuário; `gerar_slots` só admin precisa; `cidadao_consultar` precisa ficar pública (cidadão sem login).
3. Política `ag_recep_rw` em `agendamentos` exige slot — encaixes (`slot_id IS NULL`) ficam invisíveis para staff. Bug funcional + de RLS.
4. Realtime: `chamadas` e `fila_espera` publicadas, mas sem RLS em `realtime.messages` — qualquer usuário autenticado pode escutar canal de qualquer unidade.
5. `is_authenticated_staff` considera staff qualquer linha em `user_roles` (mesmo role inválido). Restringir a `admin/recepcionista/medico`.

**Aplicação:**
6. `auth-middleware.ts` e `admin-users.functions.ts` vazam mensagens internas (nomes de env vars, constraints PostgREST) para o browser.
7. `/app` só protege no cliente (`if (!user) <Navigate>`), sem `beforeLoad`. Mutations vão direto pelo cliente Supabase confiando só na RLS.

**PKs / FKs:** Todas as tabelas têm `id uuid PK`. As FKs lógicas existem nos campos (`paciente_id`, `slot_id`, etc.) mas não como constraints declaradas — isso é intencional pra permitir DELETE de paciente sem cascata bloqueando, e o trigger de auditoria + histórico cobre. **Não vou mexer.**

---

## Mudanças

### Migration única — `supabase/migrations/<timestamp>_security_hardening.sql`

```text
1. Mover pg_trgm pro schema extensions
   CREATE SCHEMA IF NOT EXISTS extensions;
   ALTER EXTENSION pg_trgm SET SCHEMA extensions;
   (e ajustar search_path nas funções que usam, se houver — não há uso direto)

2. Endurecer is_authenticated_staff
   WHERE user_id = _user_id AND role IN ('admin','recepcionista','medico')

3. RLS gap em agendamentos — política para encaixes (slot_id IS NULL):
   CREATE POLICY ag_recep_rw_encaixe ON agendamentos FOR ALL TO authenticated
     USING (is_authenticated_staff(auth.uid())
            AND slot_id IS NULL
            AND unidade_id IS NOT NULL
            AND user_can_access_unidade(auth.uid(), unidade_id))
     WITH CHECK (mesma coisa);

4. REVOKE EXECUTE de funções SECURITY DEFINER que não devem ser chamadas
   por PostgREST (são triggers ou admin-only):
   - REVOKE ... FROM PUBLIC, anon, authenticated em:
     fn_audit_row, fn_ag_set_codigo, fn_ag_status_change, fn_ag_after_delete,
     fn_ag_after_insert_hist, fn_ag_reserva_slot, fn_ag_update,
     fn_fila_check_link, handle_new_user, set_updated_at, gen_agendamento_codigo,
     gerar_slots, set_audit_context
   - GRANT EXECUTE ON gerar_slots TO authenticated (admin via has_role check
     interno — adicionar IF NOT has_role(auth.uid(),'admin') THEN RAISE)
   - log_view, log_export, log_auth: manter EXECUTE para authenticated (são
     usadas pelo cliente)
   - cidadao_consultar: manter EXECUTE para anon (rota pública /cidadao)
   - has_role, has_permission, user_can_access_unidade, user_can_see_profissional,
     is_authenticated_staff: manter (são usadas em RLS, mas RLS roda como
     postgres então só precisa GRANT EXECUTE TO authenticated pra evitar quebra)

5. Adicionar verificação de admin dentro de gerar_slots:
   IF NOT has_role(auth.uid(),'admin') AND NOT has_permission(auth.uid(),'agendas','manage')
   THEN RAISE EXCEPTION 'sem_permissao'; END IF;
```

### Realtime RLS — mesma migration

```sql
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Permite SELECT/INSERT em postgres_changes apenas se o usuário tem acesso
-- à unidade do tópico. Os tópicos atuais são "messages" globais; a forma
-- prática é restringir a authenticated + checar staff:
CREATE POLICY realtime_staff_only ON realtime.messages
  FOR SELECT TO authenticated
  USING (is_authenticated_staff(auth.uid()));
```
(Atual implementação no app escuta `postgres_changes` filtrando no cliente; restringir a staff já elimina o risco de usuário externo. Filtragem por unidade exigiria embutir `unidade_id` no nome do canal — fica como melhoria futura, não bloqueante agora.)

### Código — sanitizar erros

**`src/integrations/supabase/auth-middleware.ts`**: arquivo é auto-gerado, **não vou mexer**. Em vez disso, adicionar middleware global de sanitização.

**`src/lib/admin-users.functions.ts`**: substituir todos os `throw new Error(error.message)` por:
```ts
console.error('[admin-users]', error);
throw new Error('Operação falhou. Verifique os dados e tente novamente.');
```
Mantém erros de validação Zod (já são genéricos).

### Auth guard server-side

**`src/routes/app.tsx`**: adicionar `beforeLoad` que faz `supabase.auth.getUser()` e redireciona pra `/login` se não autenticado, antes do componente renderizar. Mantém o check client como defesa em camadas.

---

## Arquivos afetados

- **Nova migration**: `supabase/migrations/<ts>_security_hardening.sql` (extension + RLS encaixe + REVOKE + is_authenticated_staff + gerar_slots admin check + realtime RLS)
- **Editar**: `src/lib/admin-users.functions.ts` — sanitizar mensagens de erro
- **Editar**: `src/routes/app.tsx` — adicionar `beforeLoad`

## O que NÃO vou mexer
- `client.ts`, `auth-middleware.ts`, `client.server.ts`, `types.ts` (auto-gerados)
- FKs declaradas (intencionalmente lógicas)
- Migrar todas as mutações cliente→serverFn (refator grande, fora do escopo desta rodada — RLS reforçada já é o backstop correto)
