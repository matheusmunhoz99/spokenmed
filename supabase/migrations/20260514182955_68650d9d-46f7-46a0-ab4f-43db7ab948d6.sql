-- 1. Sala padrão por profissional
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS sala text;

-- 2. Tabela de chamadas
CREATE TABLE IF NOT EXISTS public.chamadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid,
  unidade_id uuid NOT NULL,
  paciente_nome text NOT NULL,
  profissional_nome text,
  sala text,
  chamado_por uuid,
  chamado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chamadas_unidade_em_idx
  ON public.chamadas (unidade_id, chamado_em DESC);

ALTER TABLE public.chamadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY ch_admin_all ON public.chamadas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY ch_staff_rw ON public.chamadas
  FOR ALL TO authenticated
  USING (
    public.is_authenticated_staff(auth.uid())
    AND public.user_can_access_unidade(auth.uid(), unidade_id)
  )
  WITH CHECK (
    public.is_authenticated_staff(auth.uid())
    AND public.user_can_access_unidade(auth.uid(), unidade_id)
  );

-- 3. Realtime
ALTER TABLE public.chamadas REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chamadas;