
-- 1) Novos valores de status (sem uso imediato no DDL — só strings em código)
ALTER TYPE public.agendamento_status ADD VALUE IF NOT EXISTS 'chegou';
ALTER TYPE public.agendamento_status ADD VALUE IF NOT EXISTS 'em_triagem';

-- 2) Carimbos do fluxo do dia
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS chegou_em    timestamptz,
  ADD COLUMN IF NOT EXISTS triagem_em   timestamptz,
  ADD COLUMN IF NOT EXISTS atendido_em  timestamptz,
  ADD COLUMN IF NOT EXISTS triagem_por  uuid;

CREATE INDEX IF NOT EXISTS idx_agendamentos_data_chegou_em
  ON public.agendamentos (data, chegou_em);

-- 3) Trigger: preenche carimbos quando status muda
CREATE OR REPLACE FUNCTION public.fn_ag_carimbos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NEW.status::text = 'atendido' AND NEW.atendido_em IS NULL THEN
    NEW.atendido_em := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ag_carimbos ON public.agendamentos;
CREATE TRIGGER trg_ag_carimbos
BEFORE INSERT OR UPDATE OF status ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_ag_carimbos();

-- 4) Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agendamentos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos';
  END IF;
END $$;

ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;
