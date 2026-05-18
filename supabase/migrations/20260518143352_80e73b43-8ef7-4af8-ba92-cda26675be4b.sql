
CREATE OR REPLACE FUNCTION public.fn_profile_set_assinatura_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.assinatura_secret IS NULL OR NEW.assinatura_secret = '' THEN
    NEW.assinatura_secret := encode(extensions.gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END $function$;
