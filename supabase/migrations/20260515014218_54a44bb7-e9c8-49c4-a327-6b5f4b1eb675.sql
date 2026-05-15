
-- 1. Move pg_trgm out of public
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 2. Endurecer is_authenticated_staff
CREATE OR REPLACE FUNCTION public.is_authenticated_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','recepcionista','medico')
  );
$function$;

-- 3. Política para encaixes (slot_id IS NULL) em agendamentos
DROP POLICY IF EXISTS ag_recep_rw_encaixe ON public.agendamentos;
CREATE POLICY ag_recep_rw_encaixe ON public.agendamentos
  FOR ALL TO authenticated
  USING (
    is_authenticated_staff(auth.uid())
    AND slot_id IS NULL
    AND unidade_id IS NOT NULL
    AND user_can_access_unidade(auth.uid(), unidade_id)
  )
  WITH CHECK (
    is_authenticated_staff(auth.uid())
    AND slot_id IS NULL
    AND unidade_id IS NOT NULL
    AND user_can_access_unidade(auth.uid(), unidade_id)
  );

-- 4. REVOKE EXECUTE em SECURITY DEFINER internos (triggers + utilitários)
REVOKE EXECUTE ON FUNCTION public.fn_audit_row()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_set_codigo()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_status_change()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_after_delete()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_after_insert_hist()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_reserva_slot()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_update()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_fila_check_link()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_agendamento_codigo()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_audit_context(text,text,text)  FROM PUBLIC, anon, authenticated;

-- gerar_slots: só admin/manage agendas
CREATE OR REPLACE FUNCTION public.gerar_slots(_config_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.agendas_config%ROWTYPE;
  d date;
  dow int;
  t time;
  fim_bloco time;
  count_inserted int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'agendas','manage')) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO cfg FROM public.agendas_config WHERE id = _config_id;
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'Configuração não encontrada'; END IF;

  d := cfg.vigencia_inicio;
  WHILE d <= cfg.vigencia_fim LOOP
    dow := EXTRACT(DOW FROM d)::int;
    IF dow = ANY(cfg.dias_semana) THEN
      IF cfg.manha_inicio IS NOT NULL AND cfg.manha_fim IS NOT NULL THEN
        t := cfg.manha_inicio;
        WHILE t + (cfg.duracao_min || ' minutes')::interval <= cfg.manha_fim LOOP
          fim_bloco := t + (cfg.duracao_min || ' minutes')::interval;
          BEGIN
            INSERT INTO public.slots(profissional_id, unidade_id, data, hora_inicio, hora_fim, agenda_config_id)
            VALUES (cfg.profissional_id, cfg.unidade_id, d, t, fim_bloco, cfg.id);
            count_inserted := count_inserted + 1;
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
          t := fim_bloco;
        END LOOP;
      END IF;
      IF cfg.tarde_inicio IS NOT NULL AND cfg.tarde_fim IS NOT NULL THEN
        t := cfg.tarde_inicio;
        WHILE t + (cfg.duracao_min || ' minutes')::interval <= cfg.tarde_fim LOOP
          fim_bloco := t + (cfg.duracao_min || ' minutes')::interval;
          BEGIN
            INSERT INTO public.slots(profissional_id, unidade_id, data, hora_inicio, hora_fim, agenda_config_id)
            VALUES (cfg.profissional_id, cfg.unidade_id, d, t, fim_bloco, cfg.id);
            count_inserted := count_inserted + 1;
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
          t := fim_bloco;
        END LOOP;
      END IF;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN count_inserted;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.gerar_slots(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.gerar_slots(uuid) TO authenticated;

-- 5. Realtime: restringir broadcast/postgres_changes a staff
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS realtime_staff_only_select ON realtime.messages;
CREATE POLICY realtime_staff_only_select ON realtime.messages
  FOR SELECT TO authenticated
  USING (public.is_authenticated_staff(auth.uid()));
