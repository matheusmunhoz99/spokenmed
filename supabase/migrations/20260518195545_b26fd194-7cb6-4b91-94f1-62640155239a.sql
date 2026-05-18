ALTER TABLE public.teleconsulta_salas
  ADD COLUMN IF NOT EXISTS host_room_url text,
  ADD COLUMN IF NOT EXISTS whereby_meeting_id text;