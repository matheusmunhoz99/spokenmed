
# Auditoria das Fases 1–7 e correção

## O que verifiquei

### Fase 7 — `cidadao_consultar`
A migration `20260514225804_*.sql` **já contém** `DROP FUNCTION IF EXISTS public.cidadao_consultar(text, text);` antes do `CREATE OR REPLACE`. Confirmei no banco: a função em produção já retorna as colunas novas `profissional_cbo`, `unidade_cnes`, `procedimento_codigo`, `procedimento_nome`. **Nada a corrigir aqui** — o painel do cidadão já recebe CNES/CBO/SIGTAP.

### Schema, RLS, triggers, FKs (Fases 1–7)
- 16 tabelas, todas com RLS habilitado e policies coerentes (admin total + staff por unidade via `user_can_access_unidade`).
- 26 triggers ativos (audit em todas as tabelas sensíveis, integridade de slots/fila, geração de código, updated_at).
- Funções `SECURITY DEFINER` corretamente isoladas (`has_role`, `is_authenticated_staff`, `user_can_*`, `has_permission`, audit, slot reserva, etc.).
- FKs do schema novo (`agendamentos.procedimento_id`, `agendas_config.procedimento_id`) presentes; índice em `agendamentos(procedimento_id)` ok.
- Bucket `anexos-agendamentos` privado, RLS por unidade.
- Não há cron jobs configurados (não é usado neste projeto — sem pg_cron, sem edge functions ativas).

### Linter — 24 warnings, classifiquei assim:

| # | Warning | Diagnóstico | Ação |
|---|---|---|---|
| 1 | `set_updated_at` sem `search_path` | **bug real** — única função sem `SET search_path` | **Corrigir** |
| 2 | extensão `pg_trgm` em `public` | herdado do template Supabase, mover é destrutivo | Documentar, não tocar |
| 3 | `cidadao_consultar` executável por anon | **intencional** (portal público) | Manter |
| 4–8 | 5 funções `SECURITY DEFINER` executáveis por anon | funções internas (audit/slot/has_role/etc) não devem ser callable por anon | **REVOKE EXECUTE FROM anon** |
| 9–24 | 16 funções executáveis por authenticated | a maioria é chamada legitimamente; mas auxiliares internas (`fn_audit_row`, `fn_ag_*`, `gen_agendamento_codigo`, `set_audit_context`) só rodam via trigger e não precisam de EXECUTE para o role | **REVOKE EXECUTE FROM authenticated** nas internas; manter nas RPCs (`log_view`, `log_auth`, `log_export`, `cidadao_consultar`, `has_role`, `has_permission`, `is_authenticated_staff`, `user_can_*`, `gerar_slots`) |

## Migration corretiva (única)

```sql
-- 1) Corrige search_path em set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2) Revoga EXECUTE de PUBLIC em todas as SECURITY DEFINER do schema public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
      AND p.proname IN (
        'fn_audit_row','fn_ag_reserva_slot','fn_ag_update','fn_ag_after_delete',
        'fn_ag_after_insert_hist','fn_ag_status_change','gen_agendamento_codigo',
        'set_audit_context','handle_new_user'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 3) Revoga anon das demais (mantendo authenticated)
REVOKE EXECUTE ON FUNCTION public.log_view(text,uuid,text,text,text)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_auth(text,text,text)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_export(text,text,jsonb,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gerar_slots(uuid)                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid,text,text)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_authenticated_staff(uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_access_unidade(uuid,uuid)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_see_profissional(uuid,uuid) FROM anon;

-- cidadao_consultar permanece executável por anon (uso pretendido)
```

## Critérios de aceite
1. Linter cai de 24 → ~2 warnings (apenas `pg_trgm in public` + `cidadao_consultar` anon executable, ambos por design).
2. Painel do cidadão segue funcionando (`cidadao_consultar` ainda callable por anon).
3. Triggers continuam funcionando (REVOKE não afeta `SECURITY DEFINER` invocados por trigger — o trigger usa o owner).
4. Nenhuma rota do app quebra (todas as RPCs chamadas pelo frontend permanecem com EXECUTE para `authenticated`).

Aprove para eu rodar a migration corretiva.
