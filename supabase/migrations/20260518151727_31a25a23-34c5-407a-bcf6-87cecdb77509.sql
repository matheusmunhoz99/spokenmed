
ALTER TYPE public.agendamento_status ADD VALUE IF NOT EXISTS 'triado';

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS triado_em timestamptz;

CREATE OR REPLACE FUNCTION public.fn_ag_carimbos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status::text = 'chegou' AND NEW.chegou_em IS NULL THEN
    NEW.chegou_em := now();
  END IF;
  IF NEW.status::text = 'em_triagem' AND NEW.triagem_em IS NULL THEN
    NEW.triagem_em := now();
    IF NEW.triagem_por IS NULL THEN
      NEW.triagem_por := auth.uid();
    END IF;
  END IF;
  IF NEW.status::text = 'triado' AND NEW.triado_em IS NULL THEN
    NEW.triado_em := now();
  END IF;
  IF NEW.status::text = 'atendido' AND NEW.atendido_em IS NULL THEN
    NEW.atendido_em := now();
  END IF;
  RETURN NEW;
END $function$;
