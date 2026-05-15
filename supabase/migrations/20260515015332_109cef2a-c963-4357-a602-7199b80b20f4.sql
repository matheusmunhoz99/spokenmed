
-- 1. Schema privado, não exposto pelo PostgREST
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- 2. Mover helpers de RLS para private
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.has_permission(uuid, text, text) SET SCHEMA private;
ALTER FUNCTION public.is_authenticated_staff(uuid) SET SCHEMA private;
ALTER FUNCTION public.user_can_access_unidade(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.user_can_see_profissional(uuid, uuid) SET SCHEMA private;

-- 3. Ajustar search_path dos helpers para enxergar o novo schema + public (tabelas)
ALTER FUNCTION private.has_role(uuid, public.app_role) SET search_path = private, public;
ALTER FUNCTION private.has_permission(uuid, text, text) SET search_path = private, public;
ALTER FUNCTION private.is_authenticated_staff(uuid) SET search_path = private, public;
ALTER FUNCTION private.user_can_access_unidade(uuid, uuid) SET search_path = private, public;
ALTER FUNCTION private.user_can_see_profissional(uuid, uuid) SET search_path = private, public;

-- 4. Atualizar funções em public que chamam helpers, qualificando com private.*
CREATE OR REPLACE FUNCTION public.gerar_slots(_config_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.agendas_config%ROWTYPE;
  d date;
  dow int;
  t time;
  fim_bloco time;
  count_inserted int := 0;
BEGIN
  IF NOT (private.has_role(auth.uid(),'admin') OR private.has_permission(auth.uid(),'agendas','manage')) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO cfg FROM public.agendas_config WHERE id = _config_id;
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'Configuração não encontrada'; END IF;

  d := cfg.vigencia_inicio;
  WHILE d <= cfg.vigencia_fim LOOP
    dow := EXTRACT(DOW FROM d)::int;
    IF dow = ANY(cfg.dias_semana) THEN
      IF cfg.manha_inicio IS NOT NULL AND cfg.manha_fim IS NOT NULL THEN
        t := cfg.manha_inicio;
        WHILE t + (cfg.duracao_min || ' minutes')::interval <= cfg.manha_fim LOOP
          fim_bloco := t + (cfg.duracao_min || ' minutes')::interval;
          BEGIN
            INSERT INTO public.slots(profissional_id, unidade_id, data, hora_inicio, hora_fim, agenda_config_id)
            VALUES (cfg.profissional_id, cfg.unidade_id, d, t, fim_bloco, cfg.id);
            count_inserted := count_inserted + 1;
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
          t := fim_bloco;
        END LOOP;
      END IF;
      IF cfg.tarde_inicio IS NOT NULL AND cfg.tarde_fim IS NOT NULL THEN
        t := cfg.tarde_inicio;
        WHILE t + (cfg.duracao_min || ' minutes')::interval <= cfg.tarde_fim LOOP
          fim_bloco := t + (cfg.duracao_min || ' minutes')::interval;
          BEGIN
            INSERT INTO public.slots(profissional_id, unidade_id, data, hora_inicio, hora_fim, agenda_config_id)
            VALUES (cfg.profissional_id, cfg.unidade_id, d, t, fim_bloco, cfg.id);
            count_inserted := count_inserted + 1;
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
          t := fim_bloco;
        END LOOP;
      END IF;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN count_inserted;
END;
$function$;

-- has_permission referencia has_role; user_can_access_unidade referencia has_role;
-- user_can_see_profissional referencia has_role.
-- Como os 5 ficam no mesmo schema `private` e search_path = private, public,
-- as referências internas continuam resolvendo. Não precisa recriar.

-- 5. Reescrever todas as políticas RLS que usam esses helpers, qualificando com `private.`
DO $$
DECLARE
  r RECORD;
  new_using text;
  new_check text;
  cmd text;
  fn_pattern constant text := '(^|[^.\w])(has_role|has_permission|is_authenticated_staff|user_can_access_unidade|user_can_see_profissional)\(';
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl, p.polname,
           pg_get_expr(p.polqual, p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pg_get_expr(p.polqual, p.polrelid) ~ fn_pattern
       OR pg_get_expr(p.polwithcheck, p.polrelid) ~ fn_pattern
  LOOP
    new_using := regexp_replace(COALESCE(r.using_expr, ''), fn_pattern, '\1private.\2(', 'g');
    new_check := regexp_replace(COALESCE(r.check_expr, ''), fn_pattern, '\1private.\2(', 'g');

    cmd := format('ALTER POLICY %I ON %I.%I', r.polname, r.sch, r.tbl);
    IF r.using_expr IS NOT NULL THEN
      cmd := cmd || format(' USING (%s)', new_using);
    END IF;
    IF r.check_expr IS NOT NULL THEN
      cmd := cmd || format(' WITH CHECK (%s)', new_check);
    END IF;
    EXECUTE cmd;
  END LOOP;
END $$;

-- 6. Garantir EXECUTE para roles de aplicação (RLS precisa avaliar como caller)
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_authenticated_staff(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.user_can_access_unidade(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.user_can_see_profissional(uuid, uuid) TO anon, authenticated, service_role;
