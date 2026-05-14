-- ============================================================
-- FASE 2: Reagendamento + Encaixe
-- ============================================================

-- 1) Colunas novas em agendamentos
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS is_encaixe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encaixe_justificativa text,
  ADD COLUMN IF NOT EXISTS encaixe_prioridade public.fila_urgencia,
  ADD COLUMN IF NOT EXISTS reagendado_de uuid,
  ADD COLUMN IF NOT EXISTS reagendado_em timestamptz;

-- Permitir slot_id nulo (encaixes não consomem slot)
ALTER TABLE public.agendamentos ALTER COLUMN slot_id DROP NOT NULL;

-- A unique antiga sobre slot_id (NOT NULL) fica permissiva com NULLs (NULLs distintos),
-- mas removemos para evitar confusão — a partial unique já cobre overbooking.
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_slot_id_key;

-- Índice auxiliar
CREATE INDEX IF NOT EXISTS idx_ag_encaixe ON public.agendamentos (data, profissional_id) WHERE is_encaixe = true;
CREATE INDEX IF NOT EXISTS idx_ag_reagendado_de ON public.agendamentos (reagendado_de) WHERE reagendado_de IS NOT NULL;

-- 2) Tabela de histórico (timeline)
CREATE TABLE IF NOT EXISTS public.agendamento_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  evento text NOT NULL CHECK (evento IN ('criado','reagendado','status_alterado','encaixe_criado','cancelado','observacao')),
  de jsonb,
  para jsonb,
  motivo text,
  user_id uuid,
  user_email text,
  user_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hist_ag ON public.agendamento_historico (agendamento_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hist_user ON public.agendamento_historico (user_id, created_at DESC);

ALTER TABLE public.agendamento_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hist_admin_all ON public.agendamento_historico;
CREATE POLICY hist_admin_all ON public.agendamento_historico
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Equipe autenticada da unidade do agendamento pode ler
DROP POLICY IF EXISTS hist_staff_select ON public.agendamento_historico;
CREATE POLICY hist_staff_select ON public.agendamento_historico
  FOR SELECT TO authenticated
  USING (
    public.is_authenticated_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = agendamento_historico.agendamento_id
        AND (a.unidade_id IS NULL OR public.user_can_access_unidade(auth.uid(), a.unidade_id))
    )
  );

-- INSERT permitido para equipe autenticada (somente do registro de sua unidade)
DROP POLICY IF EXISTS hist_staff_insert ON public.agendamento_historico;
CREATE POLICY hist_staff_insert ON public.agendamento_historico
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_authenticated_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = agendamento_historico.agendamento_id
        AND (a.unidade_id IS NULL OR public.user_can_access_unidade(auth.uid(), a.unidade_id))
    )
  );
-- Sem UPDATE/DELETE para usuários comuns (append-only).

-- 3) Atualiza fn_ag_reserva_slot para suportar encaixe (slot_id IS NULL)
CREATE OR REPLACE FUNCTION public.fn_ag_reserva_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slot RECORD;
BEGIN
  -- Encaixe não consome slot
  IF NEW.slot_id IS NULL THEN
    IF NEW.is_encaixe IS NOT TRUE THEN
      RAISE EXCEPTION 'agendamento_sem_slot_e_sem_encaixe' USING ERRCODE = 'P0004';
    END IF;
    RETURN NEW;
  END IF;

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
$function$;

-- 4) fn_ag_status_change: status muda + slot_id pode mudar (reagendamento)
-- Removemos o trigger antigo só de status e adicionamos um abrangente
DROP TRIGGER IF EXISTS trg_ag_status_change ON public.agendamentos;

CREATE OR REPLACE FUNCTION public.fn_ag_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_slot RECORD;
BEGIN
  -- 4a) Mudança de status para cancelado libera slot e devolve fila
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelado' AND OLD.status IN ('agendado','confirmado','atendido') THEN
      IF OLD.slot_id IS NOT NULL THEN
        UPDATE public.slots SET status = 'livre' WHERE id = OLD.slot_id;
      END IF;
      UPDATE public.fila_espera
         SET status = 'aguardando', agendamento_id = NULL, updated_at = now()
       WHERE agendamento_id = OLD.id;
    END IF;

    -- registra histórico de status
    INSERT INTO public.agendamento_historico(agendamento_id, evento, de, para, user_id)
    VALUES (NEW.id, 'status_alterado',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status),
            auth.uid());
  END IF;

  -- 4b) Mudança de slot_id (reagendamento)
  IF NEW.slot_id IS DISTINCT FROM OLD.slot_id THEN
    -- libera o antigo se ativo
    IF OLD.slot_id IS NOT NULL AND OLD.status IN ('agendado','confirmado') THEN
      UPDATE public.slots SET status = 'livre' WHERE id = OLD.slot_id;
    END IF;
    -- valida e reserva o novo (se houver)
    IF NEW.slot_id IS NOT NULL THEN
      SELECT * INTO v_new_slot FROM public.slots WHERE id = NEW.slot_id FOR UPDATE;
      IF v_new_slot.id IS NULL THEN
        RAISE EXCEPTION 'slot_inexistente' USING ERRCODE = 'P0001';
      END IF;
      IF v_new_slot.status <> 'livre' THEN
        RAISE EXCEPTION 'slot_indisponivel' USING ERRCODE = 'P0002';
      END IF;
      IF v_new_slot.profissional_id <> NEW.profissional_id
         OR COALESCE(v_new_slot.unidade_id::text,'') <> COALESCE(NEW.unidade_id::text,'')
         OR v_new_slot.data <> NEW.data
         OR v_new_slot.hora_inicio <> NEW.hora_inicio THEN
        RAISE EXCEPTION 'slot_incoerente' USING ERRCODE = 'P0003';
      END IF;
      UPDATE public.slots SET status = 'reservado' WHERE id = NEW.slot_id;
    END IF;

    NEW.reagendado_em := now();

    INSERT INTO public.agendamento_historico(agendamento_id, evento, de, para, user_id)
    VALUES (NEW.id, 'reagendado',
            jsonb_build_object('slot_id', OLD.slot_id, 'data', OLD.data, 'hora_inicio', OLD.hora_inicio,
                               'profissional_id', OLD.profissional_id, 'unidade_id', OLD.unidade_id),
            jsonb_build_object('slot_id', NEW.slot_id, 'data', NEW.data, 'hora_inicio', NEW.hora_inicio,
                               'profissional_id', NEW.profissional_id, 'unidade_id', NEW.unidade_id),
            auth.uid());
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ag_update ON public.agendamentos;
CREATE TRIGGER trg_ag_update
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_ag_update();

-- 5) Histórico de criação (e encaixe)
CREATE OR REPLACE FUNCTION public.fn_ag_after_insert_hist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.agendamento_historico(agendamento_id, evento, para, user_id)
  VALUES (NEW.id,
          CASE WHEN NEW.is_encaixe THEN 'encaixe_criado' ELSE 'criado' END,
          jsonb_build_object('slot_id', NEW.slot_id, 'data', NEW.data, 'hora_inicio', NEW.hora_inicio,
                             'profissional_id', NEW.profissional_id, 'unidade_id', NEW.unidade_id,
                             'is_encaixe', NEW.is_encaixe, 'encaixe_prioridade', NEW.encaixe_prioridade),
          auth.uid());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ag_after_insert_hist ON public.agendamentos;
CREATE TRIGGER trg_ag_after_insert_hist
  AFTER INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_ag_after_insert_hist();

-- 6) Garante que reagendado_de aponta para um agendamento existente (FK soft-check via trigger seria caro; usamos check simples)
-- (nada a fazer aqui; coluna apenas informativa)
