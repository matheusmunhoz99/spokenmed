ALTER TABLE public.agendamentos
  ALTER COLUMN codigo SET DEFAULT public.gen_agendamento_codigo();