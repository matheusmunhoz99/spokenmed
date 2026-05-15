CREATE OR REPLACE FUNCTION public.fn_audit_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
  v_headers jsonb;
  v_modulo text := NULLIF(current_setting('app.audit_modulo', true), '');
  v_ip text := NULLIF(current_setting('app.audit_ip', true), '');
  v_ip_inet inet;
  v_ua text := NULLIF(current_setting('app.audit_ua', true), '');
  v_acao text;
  v_before jsonb;
  v_after jsonb;
  v_diff jsonb;
  v_registro uuid;
  v_unidade uuid;
  k text;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  IF v_headers IS NOT NULL THEN
    IF v_ua IS NULL THEN
      v_ua := v_headers->>'user-agent';
    END IF;
    IF v_ip IS NULL THEN
      v_ip := COALESCE(
        split_part(v_headers->>'x-forwarded-for', ',', 1),
        v_headers->>'x-real-ip',
        v_headers->>'cf-connecting-ip'
      );
      v_ip := NULLIF(btrim(v_ip), '');
    END IF;
  END IF;

  IF v_ip IS NOT NULL THEN
    BEGIN
      v_ip_inet := v_ip::inet;
    EXCEPTION WHEN OTHERS THEN
      v_ip_inet := NULL;
    END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_acao := 'INSERT';
    v_after := to_jsonb(NEW);
    v_registro := (v_after->>'id')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_acao := 'UPDATE';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_diff := '{}'::jsonb;
    FOR k IN SELECT jsonb_object_keys(v_after) LOOP
      IF v_before->k IS DISTINCT FROM v_after->k THEN
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('before', v_before->k, 'after', v_after->k));
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    v_registro := (v_after->>'id')::uuid;
  ELSIF TG_OP = 'DELETE' THEN
    v_acao := 'DELETE';
    v_before := to_jsonb(OLD);
    v_registro := (v_before->>'id')::uuid;
  END IF;

  IF v_modulo IS NULL THEN
    v_modulo := TG_TABLE_NAME;
  END IF;

  IF (COALESCE(v_after, v_before)) ? 'unidade_id' THEN
    BEGIN
      v_unidade := ((COALESCE(v_after, v_before))->>'unidade_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v_unidade := NULL;
    END;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  END IF;

  INSERT INTO public.audit_logs (
    tabela, registro_id, acao, before_data, after_data, diff,
    user_id, user_email, user_role, unidade_id, modulo, ip, user_agent
  ) VALUES (
    TG_TABLE_NAME, v_registro, v_acao, v_before, v_after, v_diff,
    v_user_id, v_email, v_role, v_unidade, v_modulo, v_ip_inet, v_ua
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;