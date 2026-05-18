ALTER TABLE public.domicilios
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL,
  ALTER COLUMN gps_capturado_em DROP NOT NULL;