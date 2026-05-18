ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS conselho_tipo text,
  ADD COLUMN IF NOT EXISTS conselho_numero text,
  ADD COLUMN IF NOT EXISTS conselho_uf text,
  ADD COLUMN IF NOT EXISTS cbo text,
  ADD COLUMN IF NOT EXISTS especialidade text,
  ADD COLUMN IF NOT EXISTS rqe text,
  ADD COLUMN IF NOT EXISTS assinatura_secret text;

UPDATE public.profiles
   SET assinatura_secret = encode(gen_random_bytes(32), 'hex')
 WHERE assinatura_secret IS NULL;

CREATE OR REPLACE FUNCTION public.fn_profile_set_assinatura_secret()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assinatura_secret IS NULL OR NEW.assinatura_secret = '' THEN
    NEW.assinatura_secret := encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profile_assinatura_secret ON public.profiles;
CREATE TRIGGER trg_profile_assinatura_secret
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_profile_set_assinatura_secret();

REVOKE SELECT (assinatura_secret) ON public.profiles FROM authenticated, anon;

ALTER TABLE public.documentos_emitidos
  ADD COLUMN IF NOT EXISTS assinatura text,
  ADD COLUMN IF NOT EXISTS assinatura_payload_sha text,
  ADD COLUMN IF NOT EXISTS assinado_em timestamptz;