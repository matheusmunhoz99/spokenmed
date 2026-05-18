ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS cns_secundario text,
  ADD COLUMN IF NOT EXISTS outro_cns text;