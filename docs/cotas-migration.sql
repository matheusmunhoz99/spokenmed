-- =========================================================================
-- Cotas de agendamento por UBS × especialidade / × procedimento
-- + regime livre/cota por unidade + cota extra fixa da Secretaria de Saúde.
--
-- COMO APLICAR: Cole todo este script no editor SQL do backend (Lovable Cloud
-- → Backend → SQL) e execute uma única vez. Todas as instruções são
-- idempotentes (IF NOT EXISTS / OR REPLACE).
-- =========================================================================

-- 1) Regime de agendamento por unidade
ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS regime_agendamento text NOT NULL DEFAULT 'livre'
    CHECK (regime_agendamento IN ('livre','cota'));

-- 2) Cota extra da Secretaria em cotas_especialidade
ALTER TABLE public.cotas_especialidade
  ADD COLUMN IF NOT EXISTS vagas_secretaria integer NOT NULL DEFAULT 0
    CHECK (vagas_secretaria >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cotas_esp_unid_esp_comp
  ON public.cotas_especialidade (unidade_id, especialidade_id, competencia);

-- 3) Cotas por procedimento (SIGTAP)
CREATE TABLE IF NOT EXISTS public.cotas_procedimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  vagas_totais integer NOT NULL DEFAULT 0 CHECK (vagas_totais >= 0),
  vagas_secretaria integer NOT NULL DEFAULT 0 CHECK (vagas_secretaria >= 0),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, procedimento_id, competencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotas_procedimento TO authenticated;
GRANT ALL ON public.cotas_procedimento TO service_role;

ALTER TABLE public.cotas_procedimento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cotas_proc_read" ON public.cotas_procedimento;
CREATE POLICY "cotas_proc_read" ON public.cotas_procedimento
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cotas_proc_write" ON public.cotas_procedimento;
CREATE POLICY "cotas_proc_write" ON public.cotas_procedimento
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)
      OR private.has_permission(auth.uid(),'cotas','manage'))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role)
      OR private.has_permission(auth.uid(),'cotas','manage'));

DROP TRIGGER IF EXISTS trg_cotas_proc_norm ON public.cotas_procedimento;
CREATE TRIGGER trg_cotas_proc_norm
  BEFORE INSERT OR UPDATE ON public.cotas_procedimento
  FOR EACH ROW EXECUTE FUNCTION public.fn_cotas_normaliza_competencia();

DROP TRIGGER IF EXISTS trg_cotas_proc_upd ON public.cotas_procedimento;
CREATE TRIGGER trg_cotas_proc_upd
  BEFORE UPDATE ON public.cotas_procedimento
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Origem do agendamento (ubs | secretaria)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='agendamentos' AND column_name='origem_agenda'
  ) THEN
    ALTER TABLE public.agendamentos
      ADD COLUMN origem_agenda text NOT NULL DEFAULT 'ubs'
      CHECK (origem_agenda IN ('ubs','secretaria'));
  END IF;
END $$;

-- 5) Função para o front consultar consumo/limites
CREATE OR REPLACE FUNCTION public.consumo_cota(
  _unidade_id uuid,
  _especialidade_id uuid,
  _procedimento_id uuid,
  _competencia date
) RETURNS TABLE (
  regime text,
  esp_totais int, esp_secretaria int, esp_usadas_ubs int, esp_usadas_sec int,
  proc_totais int, proc_secretaria int, proc_usadas_ubs int, proc_usadas_sec int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_comp date := date_trunc('month', COALESCE(_competencia, current_date))::date;
  v_next date := (v_comp + interval '1 month')::date;
BEGIN
  SELECT u.regime_agendamento INTO regime FROM public.unidades u WHERE u.id = _unidade_id;
  regime := COALESCE(regime, 'livre');

  esp_totais := 0; esp_secretaria := 0; esp_usadas_ubs := 0; esp_usadas_sec := 0;
  proc_totais := 0; proc_secretaria := 0; proc_usadas_ubs := 0; proc_usadas_sec := 0;

  IF _especialidade_id IS NOT NULL THEN
    SELECT COALESCE(c.vagas_totais,0), COALESCE(c.vagas_secretaria,0)
      INTO esp_totais, esp_secretaria
      FROM public.cotas_especialidade c
     WHERE c.unidade_id = _unidade_id AND c.especialidade_id = _especialidade_id
       AND c.competencia = v_comp
     LIMIT 1;

    SELECT
      count(*) FILTER (WHERE a.origem_agenda = 'ubs'),
      count(*) FILTER (WHERE a.origem_agenda = 'secretaria')
      INTO esp_usadas_ubs, esp_usadas_sec
      FROM public.agendamentos a
      JOIN public.profissionais p ON p.id = a.profissional_id
     WHERE a.unidade_id = _unidade_id
       AND a.status IN ('agendado','confirmado','atendido')
       AND a.data >= v_comp AND a.data < v_next
       AND p.especialidade_id = _especialidade_id;
  END IF;

  IF _procedimento_id IS NOT NULL THEN
    SELECT COALESCE(c.vagas_totais,0), COALESCE(c.vagas_secretaria,0)
      INTO proc_totais, proc_secretaria
      FROM public.cotas_procedimento c
     WHERE c.unidade_id = _unidade_id AND c.procedimento_id = _procedimento_id
       AND c.competencia = v_comp
     LIMIT 1;

    SELECT
      count(*) FILTER (WHERE a.origem_agenda = 'ubs'),
      count(*) FILTER (WHERE a.origem_agenda = 'secretaria')
      INTO proc_usadas_ubs, proc_usadas_sec
      FROM public.agendamentos a
     WHERE a.unidade_id = _unidade_id
       AND a.status IN ('agendado','confirmado','atendido')
       AND a.data >= v_comp AND a.data < v_next
       AND a.procedimento_id = _procedimento_id;
  END IF;

  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.consumo_cota(uuid,uuid,uuid,date) TO authenticated;

-- 6) Enforcement — trigger BEFORE INSERT em agendamentos
CREATE OR REPLACE FUNCTION public.fn_ag_valida_cota()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_regime text;
  v_esp uuid;
  v_comp date := date_trunc('month', NEW.data)::date;
  v_next date := (v_comp + interval '1 month')::date;
  v_esp_tot int; v_esp_sec int; v_esp_ubs_usadas int; v_esp_sec_usadas int;
  v_proc_tot int; v_proc_sec int; v_proc_ubs_usadas int; v_proc_sec_usadas int;
  v_has_proc_cota boolean := false;
BEGIN
  IF NEW.is_encaixe IS TRUE THEN RETURN NEW; END IF;

  SELECT regime_agendamento INTO v_regime FROM public.unidades WHERE id = NEW.unidade_id;
  IF COALESCE(v_regime,'livre') = 'livre' THEN RETURN NEW; END IF;

  SELECT especialidade_id INTO v_esp FROM public.profissionais WHERE id = NEW.profissional_id;

  IF v_esp IS NOT NULL THEN
    SELECT COALESCE(vagas_totais,0), COALESCE(vagas_secretaria,0)
      INTO v_esp_tot, v_esp_sec
      FROM public.cotas_especialidade
     WHERE unidade_id = NEW.unidade_id AND especialidade_id = v_esp AND competencia = v_comp
     LIMIT 1;
    v_esp_tot := COALESCE(v_esp_tot, 0); v_esp_sec := COALESCE(v_esp_sec, 0);

    SELECT
      count(*) FILTER (WHERE origem_agenda = 'ubs'),
      count(*) FILTER (WHERE origem_agenda = 'secretaria')
      INTO v_esp_ubs_usadas, v_esp_sec_usadas
      FROM public.agendamentos a
      JOIN public.profissionais p ON p.id = a.profissional_id
     WHERE a.unidade_id = NEW.unidade_id
       AND a.status IN ('agendado','confirmado','atendido')
       AND a.data >= v_comp AND a.data < v_next
       AND p.especialidade_id = v_esp;

    IF NEW.origem_agenda = 'secretaria' THEN
      IF v_esp_sec_usadas >= v_esp_sec THEN
        RAISE EXCEPTION 'cota_esgotada_secretaria_esp' USING ERRCODE = 'P0050';
      END IF;
    ELSE
      IF v_esp_ubs_usadas >= v_esp_tot THEN
        RAISE EXCEPTION 'cota_esgotada_ubs_esp' USING ERRCODE = 'P0051';
      END IF;
    END IF;
  END IF;

  IF NEW.procedimento_id IS NOT NULL THEN
    SELECT true, COALESCE(vagas_totais,0), COALESCE(vagas_secretaria,0)
      INTO v_has_proc_cota, v_proc_tot, v_proc_sec
      FROM public.cotas_procedimento
     WHERE unidade_id = NEW.unidade_id AND procedimento_id = NEW.procedimento_id AND competencia = v_comp
     LIMIT 1;

    IF v_has_proc_cota THEN
      SELECT
        count(*) FILTER (WHERE origem_agenda = 'ubs'),
        count(*) FILTER (WHERE origem_agenda = 'secretaria')
        INTO v_proc_ubs_usadas, v_proc_sec_usadas
        FROM public.agendamentos
       WHERE unidade_id = NEW.unidade_id
         AND status IN ('agendado','confirmado','atendido')
         AND data >= v_comp AND data < v_next
         AND procedimento_id = NEW.procedimento_id;

      IF NEW.origem_agenda = 'secretaria' THEN
        IF v_proc_sec_usadas >= v_proc_sec THEN
          RAISE EXCEPTION 'cota_esgotada_secretaria_proc' USING ERRCODE = 'P0052';
        END IF;
      ELSE
        IF v_proc_ubs_usadas >= v_proc_tot THEN
          RAISE EXCEPTION 'cota_esgotada_ubs_proc' USING ERRCODE = 'P0053';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ag_valida_cota ON public.agendamentos;
CREATE TRIGGER trg_ag_valida_cota
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_ag_valida_cota();
