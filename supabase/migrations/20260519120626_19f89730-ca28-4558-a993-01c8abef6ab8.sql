
CREATE TABLE IF NOT EXISTS public.atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  profissional_id uuid REFERENCES public.profissionais(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  protocolo text,
  finalizado_em timestamptz NOT NULL DEFAULT now(),
  duracao_segundos integer DEFAULT 0,

  data_atendimento date NOT NULL DEFAULT current_date,
  hora_inicio time,
  turno text,                    -- manha | tarde | noite
  modalidade text DEFAULT 'presencial',
  tipo_atendimento text,         -- consulta_agendada, urgencia, etc
  tipo_consulta text,            -- primeira, retorno, etc
  local_atendimento text DEFAULT 'ubs',

  soap_s text,
  soap_o text,
  soap_a text,
  soap_p text,

  cids text[] DEFAULT '{}'::text[],
  ciaps text[] DEFAULT '{}'::text[],
  procedimentos_sigtap text[] DEFAULT '{}'::text[],
  exames_solicitados text[] DEFAULT '{}'::text[],
  exames_avaliados text[] DEFAULT '{}'::text[],

  pa text, fc text, fr text, temperatura text, saturacao text,
  peso numeric, altura numeric, perimetro_cefalico numeric, imc numeric,

  aleitamento text,
  vacinacao_em_dia text,
  pics boolean DEFAULT false,
  racionalidade text,
  notificacoes text[] DEFAULT '{}'::text[],

  desfechos text[] DEFAULT '{}'::text[],
  encaminhamentos_internos text[] DEFAULT '{}'::text[],
  encaminhamentos_externos text[] DEFAULT '{}'::text[],
  matriciamento_nasf boolean DEFAULT false,
  observacoes text,

  alergias jsonb DEFAULT '[]'::jsonb,
  documentos jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atendimentos_unidade_data ON public.atendimentos(unidade_id, data_atendimento);
CREATE INDEX IF NOT EXISTS idx_atendimentos_profissional_data ON public.atendimentos(profissional_id, data_atendimento);
CREATE INDEX IF NOT EXISTS idx_atendimentos_agendamento ON public.atendimentos(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_paciente ON public.atendimentos(paciente_id);

ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atendimentos_select_auth" ON public.atendimentos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "atendimentos_insert_auth" ON public.atendimentos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = criado_por);

CREATE POLICY "atendimentos_update_owner_or_admin" ON public.atendimentos
  FOR UPDATE TO authenticated
  USING (auth.uid() = criado_por OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = criado_por OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "atendimentos_delete_owner_or_admin" ON public.atendimentos
  FOR DELETE TO authenticated
  USING (auth.uid() = criado_por OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_atendimentos_updated_at
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
