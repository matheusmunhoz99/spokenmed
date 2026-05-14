
DO $$ BEGIN
  CREATE TYPE public.fila_urgencia AS ENUM ('normal','prioritaria','urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.fila_espera
  ADD COLUMN IF NOT EXISTS urgencia public.fila_urgencia NOT NULL DEFAULT 'normal';

-- Limpa duplicatas existentes em aberto: mantém o mais antigo, cancela os outros
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY paciente_id, unidade_id, especialidade_id
      ORDER BY created_at ASC
    ) AS rn
  FROM public.fila_espera
  WHERE status IN ('aguardando','agendado')
)
UPDATE public.fila_espera fe
SET status = 'cancelado', updated_at = now()
FROM ranked r
WHERE fe.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS fila_espera_unique_aberto
  ON public.fila_espera (paciente_id, unidade_id, especialidade_id)
  WHERE status IN ('aguardando','agendado');

CREATE INDEX IF NOT EXISTS fila_espera_ordem_idx
  ON public.fila_espera (unidade_id, especialidade_id, status, urgencia, created_at);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fila_espera;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.fila_espera REPLICA IDENTITY FULL;
