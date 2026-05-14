-- Corrige search_path em set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Revoga EXECUTE em funções internas (chamadas só por triggers ou interno)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
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

-- Revoga anon das RPCs que devem ser apenas de usuários autenticados
REVOKE EXECUTE ON FUNCTION public.log_view(text,uuid,text,text,text)    FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_auth(text,text,text)              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_export(text,text,jsonb,text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.gerar_slots(uuid)                     FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role)              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid,text,text)        FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_authenticated_staff(uuid)          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_can_access_unidade(uuid,uuid)    FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_can_see_profissional(uuid,uuid)  FROM anon, public;

-- cidadao_consultar permanece executável por anon (portal público do cidadão)