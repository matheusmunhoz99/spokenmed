-- 1) ENUM classificação de risco (padrão SUS / Manchester adaptado)
DO $$ BEGIN
  CREATE TYPE public.classificacao_risco AS ENUM ('vermelho','laranja','amarelo','verde','azul');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Campos de regulação SUS em fila_espera
ALTER TABLE public.fila_espera
  ADD COLUMN IF NOT EXISTS classificacao_risco public.classificacao_risco,
  ADD COLUMN IF NOT EXISTS solicitante_nome text,
  ADD COLUMN IF NOT EXISTS solicitante_cns text,
  ADD COLUMN IF NOT EXISTS solicitante_cbo text,
  ADD COLUMN IF NOT EXISTS solicitante_cnes text,
  ADD COLUMN IF NOT EXISTS cid10 text,
  ADD COLUMN IF NOT EXISTS procedimento_id uuid REFERENCES public.procedimentos(id);

-- 3) Campos de regulação SUS em agendamentos
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS classificacao_risco public.classificacao_risco,
  ADD COLUMN IF NOT EXISTS solicitante_nome text,
  ADD COLUMN IF NOT EXISTS solicitante_cns text,
  ADD COLUMN IF NOT EXISTS solicitante_cbo text,
  ADD COLUMN IF NOT EXISTS solicitante_cnes text,
  ADD COLUMN IF NOT EXISTS cid10 text;

-- 4) Tabela TME (Tempo Máximo de Espera)
CREATE TABLE IF NOT EXISTS public.tme_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  especialidade_id uuid REFERENCES public.especialidades(id) ON DELETE CASCADE,
  classificacao_risco public.classificacao_risco NOT NULL,
  tme_dias integer NOT NULL CHECK (tme_dias > 0 AND tme_dias <= 365),
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tme_config_uniq
  ON public.tme_config (
    COALESCE(especialidade_id, '00000000-0000-0000-0000-000000000000'::uuid),
    classificacao_risco,
    COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE public.tme_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tme_admin_all ON public.tme_config;
CREATE POLICY tme_admin_all ON public.tme_config FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS tme_staff_select ON public.tme_config;
CREATE POLICY tme_staff_select ON public.tme_config FOR SELECT TO authenticated
  USING (private.is_authenticated_staff(auth.uid()));

DROP TRIGGER IF EXISTS tme_set_updated_at ON public.tme_config;
CREATE TRIGGER tme_set_updated_at BEFORE UPDATE ON public.tme_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Cotas mensais por unidade × especialidade
CREATE TABLE IF NOT EXISTS public.cotas_especialidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  especialidade_id uuid NOT NULL REFERENCES public.especialidades(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  vagas_totais integer NOT NULL CHECK (vagas_totais >= 0),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, especialidade_id, competencia)
);

-- garante que competencia é sempre primeiro dia do mês
CREATE OR REPLACE FUNCTION public.fn_cotas_normaliza_competencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.competencia := date_trunc('month', NEW.competencia)::date;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cotas_normaliza_competencia ON public.cotas_especialidade;
CREATE TRIGGER cotas_normaliza_competencia BEFORE INSERT OR UPDATE ON public.cotas_especialidade
  FOR EACH ROW EXECUTE FUNCTION public.fn_cotas_normaliza_competencia();

DROP TRIGGER IF EXISTS cotas_set_updated_at ON public.cotas_especialidade;
CREATE TRIGGER cotas_set_updated_at BEFORE UPDATE ON public.cotas_especialidade
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cotas_especialidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cotas_admin_all ON public.cotas_especialidade;
CREATE POLICY cotas_admin_all ON public.cotas_especialidade FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'))
  WITH CHECK (private.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS cotas_staff_select ON public.cotas_especialidade;
CREATE POLICY cotas_staff_select ON public.cotas_especialidade FOR SELECT TO authenticated
  USING (
    private.is_authenticated_staff(auth.uid())
    AND private.user_can_access_unidade(auth.uid(), unidade_id)
  );

-- 6) View de consumo de cotas (não retorna PII)
CREATE OR REPLACE VIEW public.cotas_uso
WITH (security_invoker=on) AS
WITH consumo AS (
  SELECT
    a.unidade_id,
    p.especialidade_id,
    date_trunc('month', a.data)::date AS competencia,
    count(*) FILTER (WHERE a.status::text <> 'cancelado') AS consumidas
  FROM public.agendamentos a
  JOIN public.profissionais p ON p.id = a.profissional_id
  WHERE a.unidade_id IS NOT NULL
  GROUP BY 1, 2, 3
)
SELECT
  c.id,
  c.unidade_id,
  c.especialidade_id,
  c.competencia,
  c.vagas_totais,
  COALESCE(cs.consumidas, 0)::int AS consumidas,
  GREATEST(c.vagas_totais - COALESCE(cs.consumidas, 0), 0)::int AS disponiveis
FROM public.cotas_especialidade c
LEFT JOIN consumo cs
  ON cs.unidade_id = c.unidade_id
 AND cs.especialidade_id = c.especialidade_id
 AND cs.competencia = c.competencia;

-- 7) Função: TME aplicável (busca regra mais específica)
CREATE OR REPLACE FUNCTION public.tme_aplicavel(
  _especialidade_id uuid,
  _classificacao public.classificacao_risco,
  _unidade_id uuid
) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tme_dias FROM public.tme_config
   WHERE classificacao_risco = _classificacao
     AND (especialidade_id = _especialidade_id OR especialidade_id IS NULL)
     AND (unidade_id = _unidade_id OR unidade_id IS NULL)
   ORDER BY (especialidade_id IS NOT NULL) DESC,
            (unidade_id IS NOT NULL) DESC
   LIMIT 1;
$$;

-- 8) Seeds padrão SUS para TME (em dias) — vale para qualquer especialidade/unidade
INSERT INTO public.tme_config (especialidade_id, classificacao_risco, tme_dias, unidade_id) VALUES
  (NULL, 'vermelho', 1,   NULL),
  (NULL, 'laranja',  7,   NULL),
  (NULL, 'amarelo',  30,  NULL),
  (NULL, 'verde',    90,  NULL),
  (NULL, 'azul',     180, NULL)
ON CONFLICT DO NOTHING;

-- 9) Validação: CNS obrigatório quando paciente entra na fila de regulação
CREATE OR REPLACE FUNCTION public.fn_fila_exige_cns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cns text;
BEGIN
  SELECT cns INTO v_cns FROM public.pacientes WHERE id = NEW.paciente_id;
  IF v_cns IS NULL OR length(btrim(v_cns)) = 0 THEN
    RAISE EXCEPTION 'cns_obrigatorio_para_fila' USING ERRCODE = 'P0020';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fila_exige_cns ON public.fila_espera;
CREATE TRIGGER fila_exige_cns BEFORE INSERT ON public.fila_espera
  FOR EACH ROW EXECUTE FUNCTION public.fn_fila_exige_cns();

-- 10) Índices úteis
CREATE INDEX IF NOT EXISTS idx_fila_classificacao ON public.fila_espera (classificacao_risco) WHERE status = 'aguardando';
CREATE INDEX IF NOT EXISTS idx_agend_classificacao ON public.agendamentos (classificacao_risco);
CREATE INDEX IF NOT EXISTS idx_agend_data_unidade ON public.agendamentos (unidade_id, data);