
-- 1) Política preventiva de INSERT em profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_insert_self'
  ) THEN
    CREATE POLICY profiles_insert_self ON public.profiles
      FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- 2) Índices de performance (todos IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_profissional
  ON public.agendamentos (data, profissional_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente
  ON public.agendamentos (paciente_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data
  ON public.agendamentos (unidade_id, data);

CREATE INDEX IF NOT EXISTS idx_agendamentos_status
  ON public.agendamentos (status) WHERE status IN ('agendado','confirmado');

CREATE INDEX IF NOT EXISTS idx_slots_prof_data_status
  ON public.slots (profissional_id, data, status);

CREATE INDEX IF NOT EXISTS idx_slots_unidade_data
  ON public.slots (unidade_id, data);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON public.audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tabela_created
  ON public.audit_logs (tabela, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fila_unidade_status
  ON public.fila_espera (unidade_id, status, urgencia);

CREATE INDEX IF NOT EXISTS idx_hist_agendamento
  ON public.agendamento_historico (agendamento_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chamadas_unidade_data
  ON public.chamadas (unidade_id, chamado_em DESC);

CREATE INDEX IF NOT EXISTS idx_pacientes_cpf
  ON public.pacientes (cpf) WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_cns
  ON public.pacientes (cns) WHERE cns IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_unidades_user
  ON public.user_unidades (user_id);

-- 3) Trigger de saneamento em pacientes (normaliza CPF/CNS — não rejeita)
CREATE OR REPLACE FUNCTION public.fn_pacientes_sanitize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cpf IS NOT NULL THEN
    NEW.cpf := regexp_replace(NEW.cpf, '\D', '', 'g');
    IF NEW.cpf = '' THEN NEW.cpf := NULL; END IF;
  END IF;
  IF NEW.cns IS NOT NULL THEN
    NEW.cns := regexp_replace(NEW.cns, '\D', '', 'g');
    IF NEW.cns = '' THEN NEW.cns := NULL; END IF;
  END IF;
  IF NEW.telefone IS NOT NULL THEN
    NEW.telefone := regexp_replace(NEW.telefone, '[^\d]', '', 'g');
    IF NEW.telefone = '' THEN NEW.telefone := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pacientes_sanitize() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pacientes_sanitize ON public.pacientes;
CREATE TRIGGER trg_pacientes_sanitize
  BEFORE INSERT OR UPDATE ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_pacientes_sanitize();
