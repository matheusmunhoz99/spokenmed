
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS cnes text;
CREATE UNIQUE INDEX IF NOT EXISTS unidades_cnes_uniq ON public.unidades (cnes) WHERE cnes IS NOT NULL;

ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS cbo text;
CREATE INDEX IF NOT EXISTS profissionais_cbo_idx ON public.profissionais (cbo);

CREATE TABLE IF NOT EXISTS public.procedimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_sigtap text NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  valor_sus numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proc_admin_all ON public.procedimentos;
CREATE POLICY proc_admin_all ON public.procedimentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS proc_select_staff ON public.procedimentos;
CREATE POLICY proc_select_staff ON public.procedimentos
  FOR SELECT TO authenticated
  USING (public.is_authenticated_staff(auth.uid()));

DROP TRIGGER IF EXISTS trg_procedimentos_set_updated_at ON public.procedimentos;
CREATE TRIGGER trg_procedimentos_set_updated_at
  BEFORE UPDATE ON public.procedimentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agendas_config ADD COLUMN IF NOT EXISTS procedimento_id uuid REFERENCES public.procedimentos(id) ON DELETE SET NULL;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS procedimento_id uuid REFERENCES public.procedimentos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS agendamentos_procedimento_idx ON public.agendamentos (procedimento_id);

DROP TRIGGER IF EXISTS trg_procedimentos_audit ON public.procedimentos;
CREATE TRIGGER trg_procedimentos_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.procedimentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

INSERT INTO public.procedimentos (codigo_sigtap, nome) VALUES
  ('0301010072','Consulta médica em atenção básica'),
  ('0301010080','Consulta médica em atenção especializada'),
  ('0301010110','Consulta de profissional de nível superior na atenção básica (exceto médico)'),
  ('0301010137','Consulta médica em saúde do trabalhador'),
  ('0301010153','Consulta para acompanhamento (puericultura)'),
  ('0301010188','Consulta pré-natal'),
  ('0301010196','Consulta de puerpério (pós-parto)'),
  ('0301070067','Atendimento médico em urgência/emergência')
ON CONFLICT (codigo_sigtap) DO NOTHING;

DROP FUNCTION IF EXISTS public.cidadao_consultar(text, text);

CREATE OR REPLACE FUNCTION public.cidadao_consultar(p_codigo text, p_cpf text)
 RETURNS TABLE(codigo text, data date, hora_inicio time without time zone, status agendamento_status, is_encaixe boolean, paciente_nome text, profissional_nome text, profissional_conselho text, profissional_cbo text, especialidade_nome text, unidade_nome text, unidade_endereco text, unidade_telefone text, unidade_cnes text, procedimento_codigo text, procedimento_nome text, observacoes text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_cpf text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_cod text := upper(trim(COALESCE(p_codigo, '')));
BEGIN
  IF length(v_cpf) <> 11 OR length(v_cod) <> 8 THEN RETURN; END IF;
  RETURN QUERY
  SELECT a.codigo, a.data, a.hora_inicio, a.status, a.is_encaixe,
    pa.nome, pr.nome,
    NULLIF(concat_ws(' ', pr.conselho, pr.conselho_numero, pr.conselho_uf), ''),
    pr.cbo,
    e.nome, u.nome, u.endereco, u.telefone, u.cnes,
    pc.codigo_sigtap, pc.nome,
    a.observacoes
  FROM public.agendamentos a
  JOIN public.pacientes pa ON pa.id = a.paciente_id
  LEFT JOIN public.profissionais pr ON pr.id = a.profissional_id
  LEFT JOIN public.especialidades e ON e.id = pr.especialidade_id
  LEFT JOIN public.unidades u ON u.id = a.unidade_id
  LEFT JOIN public.procedimentos pc ON pc.id = a.procedimento_id
  WHERE a.codigo = v_cod AND pa.cpf = v_cpf
  LIMIT 1;
END;
$$;
