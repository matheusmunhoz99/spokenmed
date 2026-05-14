
-- ============================================================
-- FASE 1: Auditoria LGPD + Integridade automática
-- ============================================================

-- 0. Extensão para busca textual nos logs
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. TABELA audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela        text NOT NULL,
  registro_id   uuid,
  acao          text NOT NULL CHECK (acao IN ('INSERT','UPDATE','DELETE','VIEW','LOGIN','LOGOUT','EXPORT','DOWNLOAD')),
  before_data   jsonb,
  after_data    jsonb,
  diff          jsonb,
  user_id       uuid,
  user_email    text,
  user_role     text,
  unidade_id    uuid,
  modulo        text,
  ip            inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tabela_registro ON public.audit_logs (tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created   ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_modulo_created ON public.audit_logs (modulo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created        ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_acao           ON public.audit_logs (acao);
CREATE INDEX IF NOT EXISTS idx_audit_logs_diff_gin       ON public.audit_logs USING GIN (diff);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admin pode SELECT
DROP POLICY IF EXISTS audit_logs_admin_select ON public.audit_logs;
CREATE POLICY audit_logs_admin_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Append-only: nenhuma policy de UPDATE/DELETE.
-- INSERT vem apenas de funções SECURITY DEFINER (triggers/RPC).
-- Nenhuma policy de INSERT explicita = bloqueado para clients.

-- ============================================================
-- 2. FUNÇÃO GENÉRICA fn_audit_row()
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
  v_modulo text := NULLIF(current_setting('app.audit_modulo', true), '');
  v_ip text := NULLIF(current_setting('app.audit_ip', true), '');
  v_ua text := NULLIF(current_setting('app.audit_ua', true), '');
  v_acao text;
  v_before jsonb;
  v_after jsonb;
  v_diff jsonb;
  v_registro uuid;
  v_unidade uuid;
  k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'INSERT';
    v_after := to_jsonb(NEW);
    v_registro := (v_after->>'id')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_acao := 'UPDATE';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_diff := '{}'::jsonb;
    FOR k IN SELECT jsonb_object_keys(v_after) LOOP
      IF v_before->k IS DISTINCT FROM v_after->k THEN
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('before', v_before->k, 'after', v_after->k));
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN
      RETURN NEW; -- nada mudou efetivamente
    END IF;
    v_registro := (v_after->>'id')::uuid;
  ELSIF TG_OP = 'DELETE' THEN
    v_acao := 'DELETE';
    v_before := to_jsonb(OLD);
    v_registro := (v_before->>'id')::uuid;
  END IF;

  -- unidade_id se existir na linha
  IF (COALESCE(v_after, v_before)) ? 'unidade_id' THEN
    BEGIN
      v_unidade := ((COALESCE(v_after, v_before))->>'unidade_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v_unidade := NULL;
    END;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  END IF;

  INSERT INTO public.audit_logs (
    tabela, registro_id, acao, before_data, after_data, diff,
    user_id, user_email, user_role, unidade_id, modulo, ip, user_agent
  ) VALUES (
    TG_TABLE_NAME, v_registro, v_acao, v_before, v_after, v_diff,
    v_user_id, v_email, v_role, v_unidade, v_modulo,
    CASE WHEN v_ip IS NOT NULL THEN v_ip::inet ELSE NULL END,
    v_ua
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Aplicar trigger genérica em todas as tabelas relevantes
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'agendamentos','fila_espera','pacientes','slots',
    'profissionais','agendas_config','unidades','especialidades',
    'user_roles','user_permissions','user_unidades','profissional_unidades'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row()',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- 3. RPCs log_view e log_auth (chamadas explícitas do app)
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_view(
  p_tabela text, p_registro_id uuid, p_modulo text,
  p_ip text DEFAULT NULL, p_ua text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;

  INSERT INTO public.audit_logs (tabela, registro_id, acao, user_id, user_email, user_role, modulo, ip, user_agent)
  VALUES (p_tabela, p_registro_id, 'VIEW', v_user_id, v_email, v_role, p_modulo,
          CASE WHEN p_ip IS NOT NULL THEN p_ip::inet ELSE NULL END, p_ua);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_auth(
  p_acao text, p_ip text DEFAULT NULL, p_ua text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  IF p_acao NOT IN ('LOGIN','LOGOUT') THEN RAISE EXCEPTION 'acao invalida'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;

  INSERT INTO public.audit_logs (tabela, acao, user_id, user_email, user_role, modulo, ip, user_agent)
  VALUES ('auth', p_acao, v_user_id, v_email, v_role, 'auth',
          CASE WHEN p_ip IS NOT NULL THEN p_ip::inet ELSE NULL END, p_ua);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_export(
  p_tabela text, p_modulo text, p_filtros jsonb,
  p_ip text DEFAULT NULL, p_ua text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;

  INSERT INTO public.audit_logs (tabela, acao, user_id, user_email, user_role, modulo, ip, user_agent, after_data)
  VALUES (p_tabela, 'EXPORT', v_user_id, v_email, v_role, p_modulo,
          CASE WHEN p_ip IS NOT NULL THEN p_ip::inet ELSE NULL END, p_ua, p_filtros);
END;
$$;

-- ============================================================
-- 4. INTEGRIDADE: triggers slot ↔ agendamento ↔ fila
-- ============================================================

-- 4.1 Reservar slot ao criar agendamento (com lock, evita overbooking)
CREATE OR REPLACE FUNCTION public.fn_ag_reserva_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot RECORD;
BEGIN
  SELECT * INTO v_slot FROM public.slots WHERE id = NEW.slot_id FOR UPDATE;
  IF v_slot.id IS NULL THEN
    RAISE EXCEPTION 'slot_inexistente' USING ERRCODE = 'P0001';
  END IF;
  IF v_slot.status <> 'livre' THEN
    RAISE EXCEPTION 'slot_indisponivel' USING ERRCODE = 'P0002';
  END IF;
  IF v_slot.profissional_id <> NEW.profissional_id
     OR COALESCE(v_slot.unidade_id::text,'') <> COALESCE(NEW.unidade_id::text,'')
     OR v_slot.data <> NEW.data
     OR v_slot.hora_inicio <> NEW.hora_inicio THEN
    RAISE EXCEPTION 'slot_incoerente' USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.slots SET status = 'reservado' WHERE id = NEW.slot_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_reserva_slot ON public.agendamentos;
CREATE TRIGGER trg_ag_reserva_slot
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_ag_reserva_slot();

-- 4.2 Cancelar/atualizar status libera slot e fila
CREATE OR REPLACE FUNCTION public.fn_ag_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelado' AND OLD.status IN ('agendado','confirmado','atendido') THEN
      UPDATE public.slots SET status = 'livre' WHERE id = OLD.slot_id;
      UPDATE public.fila_espera
         SET status = 'aguardando', agendamento_id = NULL, updated_at = now()
       WHERE agendamento_id = OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_status_change ON public.agendamentos;
CREATE TRIGGER trg_ag_status_change
  AFTER UPDATE OF status ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_ag_status_change();

-- 4.3 DELETE de agendamento libera slot e fila
CREATE OR REPLACE FUNCTION public.fn_ag_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('agendado','confirmado','atendido') THEN
    UPDATE public.slots SET status = 'livre' WHERE id = OLD.slot_id;
  END IF;
  UPDATE public.fila_espera
     SET status = 'aguardando', agendamento_id = NULL, updated_at = now()
   WHERE agendamento_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_after_delete ON public.agendamentos;
CREATE TRIGGER trg_ag_after_delete
  AFTER DELETE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_ag_after_delete();

-- 4.4 Anti-overbooking: índice único parcial (1 agendamento ativo por slot)
CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_slot_ativo_uniq
  ON public.agendamentos(slot_id)
  WHERE status IN ('agendado','confirmado','atendido');

-- 4.5 Anti-conflito do paciente: 1 consulta ativa no mesmo horário
CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_paciente_horario_uniq
  ON public.agendamentos(paciente_id, data, hora_inicio)
  WHERE status IN ('agendado','confirmado');

-- 4.6 Validação fila: agendado exige agendamento_id
CREATE OR REPLACE FUNCTION public.fn_fila_check_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'agendado' AND NEW.agendamento_id IS NULL THEN
    RAISE EXCEPTION 'fila_agendado_sem_agendamento_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fila_check_link ON public.fila_espera;
CREATE TRIGGER trg_fila_check_link
  BEFORE INSERT OR UPDATE ON public.fila_espera
  FOR EACH ROW EXECUTE FUNCTION public.fn_fila_check_link();

-- ============================================================
-- 5. Permitir leitura via RPC para set local de contexto
--    (auxiliar para server functions setarem ip/ua/modulo)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_audit_context(
  p_ip text DEFAULT NULL,
  p_ua text DEFAULT NULL,
  p_modulo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.audit_ip', COALESCE(p_ip, ''), true);
  PERFORM set_config('app.audit_ua', COALESCE(p_ua, ''), true);
  PERFORM set_config('app.audit_modulo', COALESCE(p_modulo, ''), true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_view(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_auth(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_export(text, text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_audit_context(text, text, text) TO authenticated;
