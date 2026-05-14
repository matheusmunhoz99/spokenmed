CREATE TYPE public.fila_status AS ENUM ('aguardando','agendado','concluido','cancelado');

CREATE TABLE public.fila_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL,
  unidade_id uuid NOT NULL,
  especialidade_id uuid NOT NULL,
  status public.fila_status NOT NULL DEFAULT 'aguardando',
  agendamento_id uuid,
  observacoes text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fila_lookup ON public.fila_espera (unidade_id, especialidade_id, status, created_at);
CREATE INDEX idx_fila_paciente ON public.fila_espera (paciente_id, status);

ALTER TABLE public.fila_espera ENABLE ROW LEVEL SECURITY;

CREATE POLICY fila_admin_all ON public.fila_espera
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY fila_staff_rw ON public.fila_espera
  FOR ALL TO authenticated
  USING (public.is_authenticated_staff(auth.uid()) AND public.user_can_access_unidade(auth.uid(), unidade_id))
  WITH CHECK (public.is_authenticated_staff(auth.uid()) AND public.user_can_access_unidade(auth.uid(), unidade_id));

CREATE TRIGGER trg_fila_updated BEFORE UPDATE ON public.fila_espera
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fila_espera REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fila_espera;