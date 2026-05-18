
-- ========== Extensão de agendamentos ==========
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS modalidade text NOT NULL DEFAULT 'presencial'
    CHECK (modalidade IN ('presencial','teleconsulta')),
  ADD COLUMN IF NOT EXISTS tele_sala_id uuid;

-- ========== teleconsulta_salas ==========
CREATE TABLE IF NOT EXISTS public.teleconsulta_salas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL UNIQUE,
  daily_room_name text NOT NULL UNIQUE,
  daily_room_url text NOT NULL,
  token_paciente text NOT NULL UNIQUE,
  consentimento_gravacao boolean NOT NULL DEFAULT false,
  consentimento_em timestamptz,
  consentimento_ip inet,
  gravar boolean NOT NULL DEFAULT false,
  recording_id text,
  recording_url text,
  recording_expira_em timestamptz,
  iniciada_em timestamptz,
  encerrada_em timestamptz,
  duracao_seg integer,
  status text NOT NULL DEFAULT 'agendada'
    CHECK (status IN ('agendada','em_andamento','encerrada','cancelada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_tele_sala_fk
  FOREIGN KEY (tele_sala_id) REFERENCES public.teleconsulta_salas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tele_salas_agendamento ON public.teleconsulta_salas(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_tele_salas_token ON public.teleconsulta_salas(token_paciente);

ALTER TABLE public.teleconsulta_salas ENABLE ROW LEVEL SECURITY;

CREATE POLICY tele_salas_admin_all ON public.teleconsulta_salas
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY tele_salas_medico_rw ON public.teleconsulta_salas
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agendamentos a
    JOIN public.profissionais p ON p.id = a.profissional_id
    WHERE a.id = teleconsulta_salas.agendamento_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agendamentos a
    JOIN public.profissionais p ON p.id = a.profissional_id
    WHERE a.id = teleconsulta_salas.agendamento_id AND p.user_id = auth.uid()
  ));

CREATE POLICY tele_salas_staff_select ON public.teleconsulta_salas
  FOR SELECT TO authenticated
  USING (private.is_authenticated_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = teleconsulta_salas.agendamento_id
      AND (a.unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), a.unidade_id))
  ));

CREATE POLICY tele_salas_staff_insert ON public.teleconsulta_salas
  FOR INSERT TO authenticated
  WITH CHECK (private.is_authenticated_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = teleconsulta_salas.agendamento_id
      AND (a.unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), a.unidade_id))
  ));

CREATE TRIGGER trg_tele_salas_updated BEFORE UPDATE ON public.teleconsulta_salas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== teleconsulta_avaliacoes ==========
CREATE TABLE IF NOT EXISTS public.teleconsulta_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id uuid NOT NULL UNIQUE REFERENCES public.teleconsulta_salas(id) ON DELETE CASCADE,
  nota integer NOT NULL CHECK (nota BETWEEN 1 AND 5),
  nps integer CHECK (nps BETWEEN 0 AND 10),
  comentario text,
  audio_ok boolean,
  video_ok boolean,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teleconsulta_avaliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tele_aval_admin_all ON public.teleconsulta_avaliacoes
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY tele_aval_staff_select ON public.teleconsulta_avaliacoes
  FOR SELECT TO authenticated
  USING (private.is_authenticated_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.teleconsulta_salas s
    JOIN public.agendamentos a ON a.id = s.agendamento_id
    WHERE s.id = teleconsulta_avaliacoes.sala_id
      AND (a.unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), a.unidade_id))
  ));

-- ========== teleconsulta_resumos ==========
CREATE TABLE IF NOT EXISTS public.teleconsulta_resumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL UNIQUE,
  resumo_paciente text,
  notas_internas text,
  publicado boolean NOT NULL DEFAULT false,
  publicado_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teleconsulta_resumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tele_resumo_admin_all ON public.teleconsulta_resumos
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY tele_resumo_medico_rw ON public.teleconsulta_resumos
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agendamentos a
    JOIN public.profissionais p ON p.id = a.profissional_id
    WHERE a.id = teleconsulta_resumos.agendamento_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agendamentos a
    JOIN public.profissionais p ON p.id = a.profissional_id
    WHERE a.id = teleconsulta_resumos.agendamento_id AND p.user_id = auth.uid()
  ));

CREATE POLICY tele_resumo_staff_select ON public.teleconsulta_resumos
  FOR SELECT TO authenticated
  USING (private.is_authenticated_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = teleconsulta_resumos.agendamento_id
      AND (a.unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), a.unidade_id))
  ));

CREATE TRIGGER trg_tele_resumos_updated BEFORE UPDATE ON public.teleconsulta_resumos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== RPCs públicas ==========

-- tele_paciente_entrar: paciente troca o token por dados da sala
CREATE OR REPLACE FUNCTION public.tele_paciente_entrar(p_token text)
RETURNS TABLE (
  sala_id uuid,
  room_url text,
  room_name text,
  paciente_nome text,
  profissional_nome text,
  data date,
  hora_inicio time,
  gravar boolean,
  consentimento_gravacao boolean,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sala public.teleconsulta_salas%ROWTYPE;
  v_ag public.agendamentos%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN; END IF;
  SELECT * INTO v_sala FROM public.teleconsulta_salas WHERE token_paciente = p_token LIMIT 1;
  IF v_sala.id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_ag FROM public.agendamentos WHERE id = v_sala.agendamento_id;
  IF v_ag.id IS NULL THEN RETURN; END IF;

  IF v_sala.status = 'agendada' THEN
    UPDATE public.teleconsulta_salas
       SET status = 'em_andamento', iniciada_em = COALESCE(iniciada_em, now())
     WHERE id = v_sala.id;
    v_sala.status := 'em_andamento';
  END IF;

  RETURN QUERY
  SELECT v_sala.id, v_sala.daily_room_url, v_sala.daily_room_name,
    (SELECT nome FROM public.pacientes WHERE id = v_ag.paciente_id),
    (SELECT nome FROM public.profissionais WHERE id = v_ag.profissional_id),
    v_ag.data, v_ag.hora_inicio,
    v_sala.gravar, v_sala.consentimento_gravacao, v_sala.status;
END $$;

GRANT EXECUTE ON FUNCTION public.tele_paciente_entrar(text) TO anon, authenticated;

-- tele_aceitar_gravacao
CREATE OR REPLACE FUNCTION public.tele_aceitar_gravacao(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers jsonb;
  v_ip inet;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN false; END IF;

  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
    v_ip := NULLIF(split_part(v_headers->>'x-forwarded-for', ',', 1), '')::inet;
  EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  UPDATE public.teleconsulta_salas
     SET consentimento_gravacao = true,
         consentimento_em = now(),
         consentimento_ip = v_ip
   WHERE token_paciente = p_token;
  RETURN FOUND;
END $$;

GRANT EXECUTE ON FUNCTION public.tele_aceitar_gravacao(text) TO anon, authenticated;

-- tele_avaliar
CREATE OR REPLACE FUNCTION public.tele_avaliar(
  p_token text, p_nota integer, p_nps integer, p_comentario text,
  p_audio_ok boolean, p_video_ok boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sala_id uuid;
  v_headers jsonb;
  v_ip inet;
BEGIN
  IF p_nota IS NULL OR p_nota < 1 OR p_nota > 5 THEN RETURN false; END IF;
  SELECT id INTO v_sala_id FROM public.teleconsulta_salas WHERE token_paciente = p_token;
  IF v_sala_id IS NULL THEN RETURN false; END IF;

  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
    v_ip := NULLIF(split_part(v_headers->>'x-forwarded-for', ',', 1), '')::inet;
  EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  INSERT INTO public.teleconsulta_avaliacoes(sala_id, nota, nps, comentario, audio_ok, video_ok, ip)
  VALUES (v_sala_id, p_nota, p_nps, NULLIF(btrim(p_comentario),''), p_audio_ok, p_video_ok, v_ip)
  ON CONFLICT (sala_id) DO UPDATE
    SET nota = EXCLUDED.nota, nps = EXCLUDED.nps, comentario = EXCLUDED.comentario,
        audio_ok = EXCLUDED.audio_ok, video_ok = EXCLUDED.video_ok;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.tele_avaliar(text,integer,integer,text,boolean,boolean) TO anon, authenticated;

-- cidadao_consultar_documentos: CPF + data nascimento
CREATE OR REPLACE FUNCTION public.cidadao_consultar_documentos(p_cpf text, p_data_nasc date)
RETURNS TABLE (
  agendamento_id uuid,
  data date,
  hora_inicio time,
  status agendamento_status,
  modalidade text,
  profissional_nome text,
  especialidade_nome text,
  unidade_nome text,
  resumo_paciente text,
  resumo_publicado_em timestamptz,
  sala_token text,
  avaliada boolean,
  recording_disponivel boolean,
  documentos jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf text := regexp_replace(COALESCE(p_cpf,''), '\D', '', 'g');
  v_headers jsonb;
  v_ip text;
  v_ip_inet inet;
  v_fail int;
BEGIN
  IF length(v_cpf) <> 11 OR p_data_nasc IS NULL THEN RETURN; END IF;

  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
    v_ip := NULLIF(split_part(v_headers->>'x-forwarded-for', ',', 1), '');
    IF v_ip IS NOT NULL THEN v_ip_inet := v_ip::inet; END IF;
  EXCEPTION WHEN OTHERS THEN v_ip_inet := NULL; END;

  SELECT count(*) INTO v_fail FROM public.cidadao_consulta_tentativas
   WHERE cpf = v_cpf AND sucesso = false AND created_at > now() - interval '1 hour';
  IF v_fail >= 10 THEN
    RAISE EXCEPTION 'rate_limit_cpf' USING ERRCODE = 'P0010';
  END IF;

  RETURN QUERY
  SELECT a.id, a.data, a.hora_inicio, a.status, a.modalidade,
    pr.nome, e.nome, u.nome,
    CASE WHEN r.publicado THEN r.resumo_paciente END,
    CASE WHEN r.publicado THEN r.publicado_em END,
    s.token_paciente,
    EXISTS (SELECT 1 FROM public.teleconsulta_avaliacoes av WHERE av.sala_id = s.id),
    (s.recording_url IS NOT NULL AND (s.recording_expira_em IS NULL OR s.recording_expira_em > now())),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'protocolo', d.protocolo, 'tipo', d.tipo, 'emitido_em', d.created_at
      ) ORDER BY d.created_at DESC)
      FROM public.documentos_emitidos d WHERE d.agendamento_id = a.id
    ), '[]'::jsonb)
  FROM public.agendamentos a
  JOIN public.pacientes pa ON pa.id = a.paciente_id
  LEFT JOIN public.profissionais pr ON pr.id = a.profissional_id
  LEFT JOIN public.especialidades e ON e.id = pr.especialidade_id
  LEFT JOIN public.unidades u ON u.id = a.unidade_id
  LEFT JOIN public.teleconsulta_salas s ON s.agendamento_id = a.id
  LEFT JOIN public.teleconsulta_resumos r ON r.agendamento_id = a.id
  WHERE pa.cpf = v_cpf
    AND pa.data_nascimento = p_data_nasc
    AND a.data >= (current_date - interval '7 days')
  ORDER BY a.data DESC, a.hora_inicio DESC;

  INSERT INTO public.cidadao_consulta_tentativas(cpf, ip, sucesso) VALUES (v_cpf, v_ip_inet, true);
END $$;

GRANT EXECUTE ON FUNCTION public.cidadao_consultar_documentos(text,date) TO anon, authenticated;
