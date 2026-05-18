DROP FUNCTION IF EXISTS public.verificar_documento(text);

CREATE OR REPLACE FUNCTION public.verificar_documento(p_protocolo text)
 RETURNS TABLE(protocolo text, tipo text, paciente_nome_iniciais text, paciente_cpf_mask text, profissional_nome text, profissional_conselho text, profissional_cbo text, unidade_nome text, unidade_cnes text, emitido_em timestamp with time zone, assinatura text, assinado_em timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cod text := upper(btrim(coalesce(p_protocolo, '')));
BEGIN
  IF length(v_cod) < 6 OR length(v_cod) > 40 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.protocolo,
    d.tipo,
    (
      split_part(d.paciente_nome, ' ', 1) || ' ' ||
      regexp_replace(
        substring(d.paciente_nome from position(' ' in d.paciente_nome) + 1),
        '([A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ]*)',
        '\1.', 'g'
      )
    )::text AS paciente_nome_iniciais,
    d.paciente_cpf_mask,
    d.profissional_nome,
    d.profissional_conselho,
    d.profissional_cbo,
    d.unidade_nome,
    d.unidade_cnes,
    d.created_at AS emitido_em,
    d.assinatura,
    d.assinado_em
  FROM public.documentos_emitidos d
  WHERE d.protocolo = v_cod
  LIMIT 1;
END;
$function$;