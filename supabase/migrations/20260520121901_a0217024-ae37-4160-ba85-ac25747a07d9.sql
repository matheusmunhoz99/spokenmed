ALTER TABLE public.visitas_domiciliares
  DROP CONSTRAINT IF EXISTS assinatura_ou_recusa;

ALTER TABLE public.visitas_domiciliares
  ADD CONSTRAINT assinatura_ou_recusa
  CHECK (
    desfecho <> 'visita_realizada'
    OR assinatura_paciente IS NOT NULL
    OR assinatura_recusada = true
  );