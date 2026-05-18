
CREATE TABLE IF NOT EXISTS public.documento_verificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo text NOT NULL,
  documento_id uuid NULL,
  ip inet NULL,
  ip_hash text NULL,
  user_agent_resumo text NULL,
  consultado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docverif_protocolo_em
  ON public.documento_verificacoes (protocolo, consultado_em DESC);
CREATE INDEX IF NOT EXISTS idx_docverif_documento
  ON public.documento_verificacoes (documento_id, consultado_em DESC);

ALTER TABLE public.documento_verificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS docverif_admin_select ON public.documento_verificacoes;
CREATE POLICY docverif_admin_select
  ON public.documento_verificacoes
  FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

DROP FUNCTION IF EXISTS public.verificar_documento(text);

CREATE FUNCTION public.verificar_documento(p_protocolo text)
RETURNS TABLE(
  protocolo text,
  tipo text,
  paciente_nome_iniciais text,
  paciente_cpf_mask text,
  profissional_nome text,
  profissional_conselho text,
  profissional_cbo text,
  unidade_nome text,
  unidade_cnes text,
  emitido_em timestamptz,
  assinatura text,
  assinado_em timestamptz,
  consultas_24h integer,
  consultas_total integer,
  ultima_consulta timestamptz,
  eventos jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cod text := upper(btrim(coalesce(p_protocolo, '')));
  v_headers jsonb;
  v_ip text;
  v_ip_inet inet;
  v_ua text;
  v_ua_resumo text;
  v_ip_hash text;
  v_doc_id uuid;
  v_count_recent_ip int;
BEGIN
  IF length(v_cod) < 6 OR length(v_cod) > 40 THEN
    RETURN;
  END IF;

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
    v_ua := v_headers->>'user-agent';
    IF v_ip IS NOT NULL THEN
      BEGIN v_ip_inet := v_ip::inet; EXCEPTION WHEN OTHERS THEN v_ip_inet := NULL; END;
      v_ip_hash := encode(extensions.digest(v_ip, 'sha256'), 'hex');
    END IF;
  END IF;

  IF v_ua IS NOT NULL THEN
    v_ua_resumo := CASE
      WHEN v_ua ILIKE '%Edg/%'    THEN 'Edge'
      WHEN v_ua ILIKE '%OPR/%'    THEN 'Opera'
      WHEN v_ua ILIKE '%Chrome/%' THEN 'Chrome'
      WHEN v_ua ILIKE '%Firefox/%' THEN 'Firefox'
      WHEN v_ua ILIKE '%Safari/%' THEN 'Safari'
      ELSE 'Outro'
    END;
    IF v_ua ILIKE '%Android%' THEN v_ua_resumo := v_ua_resumo || ' · Android';
    ELSIF v_ua ILIKE '%iPhone%' OR v_ua ILIKE '%iPad%' THEN v_ua_resumo := v_ua_resumo || ' · iOS';
    ELSIF v_ua ILIKE '%Windows%' THEN v_ua_resumo := v_ua_resumo || ' · Windows';
    ELSIF v_ua ILIKE '%Mac OS%' THEN v_ua_resumo := v_ua_resumo || ' · macOS';
    ELSIF v_ua ILIKE '%Linux%' THEN v_ua_resumo := v_ua_resumo || ' · Linux';
    END IF;
  END IF;

  SELECT d.id INTO v_doc_id FROM public.documentos_emitidos d WHERE d.protocolo = v_cod LIMIT 1;

  IF v_ip_inet IS NOT NULL THEN
    SELECT count(*) INTO v_count_recent_ip
      FROM public.documento_verificacoes
     WHERE protocolo = v_cod AND ip = v_ip_inet
       AND consultado_em > now() - interval '10 minutes';
    IF v_count_recent_ip < 60 THEN
      INSERT INTO public.documento_verificacoes (protocolo, documento_id, ip, ip_hash, user_agent_resumo)
      VALUES (v_cod, v_doc_id, v_ip_inet, v_ip_hash, v_ua_resumo);
    END IF;
  ELSE
    INSERT INTO public.documento_verificacoes (protocolo, documento_id, ip, ip_hash, user_agent_resumo)
    VALUES (v_cod, v_doc_id, NULL, NULL, v_ua_resumo);
  END IF;

  IF v_doc_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH stats AS (
    SELECT
      count(*) FILTER (WHERE consultado_em > now() - interval '24 hours')::int AS c24,
      count(*)::int AS ctot,
      max(consultado_em) AS ult
    FROM public.documento_verificacoes
    WHERE documento_id = v_doc_id
  ),
  ev AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'consultado_em', consultado_em,
      'user_agent_resumo', user_agent_resumo,
      'ip_mask', CASE WHEN ip_hash IS NULL THEN NULL ELSE left(ip_hash, 8) END
    ) ORDER BY consultado_em DESC), '[]'::jsonb) AS eventos
    FROM (
      SELECT consultado_em, user_agent_resumo, ip_hash
        FROM public.documento_verificacoes
       WHERE documento_id = v_doc_id
       ORDER BY consultado_em DESC
       LIMIT 10
    ) t
  )
  SELECT
    d.protocolo, d.tipo,
    (
      split_part(d.paciente_nome, ' ', 1) || ' ' ||
      regexp_replace(
        substring(d.paciente_nome from position(' ' in d.paciente_nome) + 1),
        '([A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ]*)', '\1.', 'g'
      )
    )::text,
    d.paciente_cpf_mask, d.profissional_nome, d.profissional_conselho, d.profissional_cbo,
    d.unidade_nome, d.unidade_cnes, d.created_at, d.assinatura, d.assinado_em,
    stats.c24, stats.ctot, stats.ult, ev.eventos
  FROM public.documentos_emitidos d
  CROSS JOIN stats CROSS JOIN ev
  WHERE d.id = v_doc_id
  LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verificar_documento(text) TO anon, authenticated;
