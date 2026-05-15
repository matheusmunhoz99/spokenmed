-- 1) Remove DEFAULT que tentava executar gen_agendamento_codigo() com permissão de usuário
ALTER TABLE public.agendamentos ALTER COLUMN codigo DROP DEFAULT;

-- 2) Recria gen_agendamento_codigo como SECURITY DEFINER (mantém EXECUTE revogado)
CREATE OR REPLACE FUNCTION public.gen_agendamento_codigo()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i int;
  exists_already boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.agendamentos WHERE codigo = result) INTO exists_already;
    IF NOT exists_already THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gen_agendamento_codigo() FROM PUBLIC, anon, authenticated;

-- 3) Recria fn_ag_set_codigo como SECURITY DEFINER para que possa chamar gen_agendamento_codigo
CREATE OR REPLACE FUNCTION public.fn_ag_set_codigo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := public.gen_agendamento_codigo();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ag_set_codigo() FROM PUBLIC, anon, authenticated;
