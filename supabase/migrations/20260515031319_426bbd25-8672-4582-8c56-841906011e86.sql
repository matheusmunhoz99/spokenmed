CREATE OR REPLACE FUNCTION public.cidadao_consultar(p_codigo text, p_cpf text)
 RETURNS TABLE(codigo text, data date, hora_inicio time without time zone, status agendamento_status, is_encaixe boolean, paciente_nome text, profissional_nome text, profissional_conselho text, profissional_cbo text, especialidade_nome text, unidade_nome text, unidade_endereco text, unidade_telefone text, unidade_cnes text, procedimento_codigo text, procedimento_nome text, observacoes text)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cpf text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_cod text := upper(trim(COALESCE(p_codigo, '')));
  v_headers jsonb;
  v_ip text;
  v_ip_inet inet;
  v_fail_cpf int;
  v_fail_ip int;
  v_found boolean := false;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;

  IF v_headers IS NOT NULL THEN
    v_ip := COALESCE(
      split_part(v_headers->>'x-forwarded-for', ',', 1),
      v_headers->>'x-real-ip',
      v_headers->>'cf-connecting-ip'
    );
    v_ip := NULLIF(btrim(v_ip), '');
    IF v_ip IS NOT NULL THEN
      BEGIN v_ip_inet := v_ip::inet; EXCEPTION WHEN OTHERS THEN v_ip_inet := NULL; END;
    END IF;
  END IF;

  IF length(v_cpf) <> 11 OR length(v_cod) <> 8 THEN
    INSERT INTO public.cidadao_consulta_tentativas(cpf, ip, sucesso)
    VALUES (NULLIF(v_cpf,''), v_ip_inet, false);
    RETURN;
  END IF;

  SELECT count(*) INTO v_fail_cpf
    FROM public.cidadao_consulta_tentativas
   WHERE cpf = v_cpf AND sucesso = false AND created_at > now() - interval '1 hour';
  IF v_fail_cpf >= 10 THEN
    RAISE EXCEPTION 'rate_limit_cpf' USING ERRCODE = 'P0010';
  END IF;

  IF v_ip_inet IS NOT NULL THEN
    SELECT count(*) INTO v_fail_ip
      FROM public.cidadao_consulta_tentativas
     WHERE ip = v_ip_inet AND sucesso = false AND created_at > now() - interval '1 hour';
    IF v_fail_ip >= 30 THEN
      RAISE EXCEPTION 'rate_limit_ip' USING ERRCODE = 'P0011';
    END IF;
  END IF;

  RETURN QUERY
  SELECT a.codigo, a.data, a.hora_inicio, a.status, a.is_encaixe,
    pa.nome, pr.nome,
    NULLIF(concat_ws(' ', pr.conselho, pr.conselho_numero, pr.conselho_uf), ''),
    pr.cbo,
    e.nome, u.nome, u.endereco, u.telefone, u.cnes,
    pc.codigo_sigtap, pc.nome,
    a.observacoes
  FROM public.agendamentos a
  JOIN public.pacientes pa ON pa.id = a.paciente_id
  LEFT JOIN public.profissionais pr ON pr.id = a.profissional_id
  LEFT JOIN public.especialidades e ON e.id = pr.especialidade_id
  LEFT JOIN public.unidades u ON u.id = a.unidade_id
  LEFT JOIN public.procedimentos pc ON pc.id = a.procedimento_id
  WHERE a.codigo = v_cod AND pa.cpf = v_cpf
  LIMIT 1;

  GET DIAGNOSTICS v_found = ROW_COUNT;

  INSERT INTO public.cidadao_consulta_tentativas(cpf, ip, sucesso)
  VALUES (v_cpf, v_ip_inet, v_found);
END;
$function$;