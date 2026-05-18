
-- ============ receita_contadores ============
CREATE TABLE public.receita_contadores (
  uf text NOT NULL,
  serie text NOT NULL,
  ultimo_numero bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (uf, serie)
);

ALTER TABLE public.receita_contadores ENABLE ROW LEVEL SECURITY;
-- Sem políticas: acesso só via função SECURITY DEFINER.

-- ============ receitas ============
CREATE TABLE public.receitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE,
  serie text NOT NULL CHECK (serie IN ('A','B')),
  uf text NOT NULL CHECK (length(uf) = 2),
  sequencia bigint NOT NULL,

  profissional_id uuid,
  paciente_id uuid,
  agendamento_id uuid,
  unidade_id uuid,

  -- snapshots (não dependem de FK para sobreviver a alterações)
  profissional_nome text NOT NULL,
  profissional_crm text,
  profissional_uf text,
  profissional_cbo text,
  profissional_conselho_tipo text,
  paciente_nome text NOT NULL,
  paciente_cpf_mask text,
  unidade_nome text,
  unidade_cnes text,

  medicamentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  orientacoes text,
  validade_dias int NOT NULL DEFAULT 30,

  hash_conteudo text NOT NULL,
  assinatura text,
  assinatura_payload_sha text,
  assinado_em timestamptz,

  status text NOT NULL DEFAULT 'valida' CHECK (status IN ('valida','cancelada','utilizada','expirada')),
  emitido_em timestamptz NOT NULL DEFAULT now(),
  utilizado_em timestamptz,
  cancelado_em timestamptz,
  cancelado_motivo text,

  emitido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_receitas_emitido_por ON public.receitas(emitido_por);
CREATE INDEX idx_receitas_paciente ON public.receitas(paciente_id);
CREATE INDEX idx_receitas_unidade ON public.receitas(unidade_id);
CREATE INDEX idx_receitas_status ON public.receitas(status);
CREATE INDEX idx_receitas_emitido_em ON public.receitas(emitido_em DESC);

ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY rec_admin_all ON public.receitas FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY rec_staff_select ON public.receitas FOR SELECT TO authenticated
  USING (
    private.is_authenticated_staff(auth.uid())
    AND ((unidade_id IS NULL) OR private.user_can_access_unidade(auth.uid(), unidade_id))
  );

CREATE POLICY rec_staff_insert ON public.receitas FOR INSERT TO authenticated
  WITH CHECK (
    private.is_authenticated_staff(auth.uid())
    AND emitido_por = auth.uid()
    AND ((unidade_id IS NULL) OR private.user_can_access_unidade(auth.uid(), unidade_id))
  );

-- Update apenas para o emissor (mudar status); o trigger garante imutabilidade dos campos críticos
CREATE POLICY rec_emitter_update ON public.receitas FOR UPDATE TO authenticated
  USING (emitido_por = auth.uid())
  WITH CHECK (emitido_por = auth.uid());

-- ============ receita_logs ============
CREATE TABLE public.receita_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receita_id uuid NOT NULL REFERENCES public.receitas(id) ON DELETE CASCADE,
  evento text NOT NULL,
  user_id uuid,
  user_email text,
  ip inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_receita_logs_receita ON public.receita_logs(receita_id, created_at DESC);

ALTER TABLE public.receita_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY reclog_admin_all ON public.receita_logs FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY reclog_emitter_select ON public.receita_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receitas r WHERE r.id = receita_logs.receita_id AND r.emitido_por = auth.uid()));

CREATE POLICY reclog_staff_insert ON public.receita_logs FOR INSERT TO authenticated
  WITH CHECK (private.is_authenticated_staff(auth.uid()));

-- ============ trigger imutabilidade ============
CREATE OR REPLACE FUNCTION public.fn_receita_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero IS DISTINCT FROM OLD.numero
    OR NEW.serie IS DISTINCT FROM OLD.serie
    OR NEW.uf IS DISTINCT FROM OLD.uf
    OR NEW.sequencia IS DISTINCT FROM OLD.sequencia
    OR NEW.hash_conteudo IS DISTINCT FROM OLD.hash_conteudo
    OR NEW.assinatura IS DISTINCT FROM OLD.assinatura
    OR NEW.assinatura_payload_sha IS DISTINCT FROM OLD.assinatura_payload_sha
    OR NEW.assinado_em IS DISTINCT FROM OLD.assinado_em
    OR NEW.medicamentos::text IS DISTINCT FROM OLD.medicamentos::text
    OR NEW.orientacoes IS DISTINCT FROM OLD.orientacoes
    OR NEW.paciente_nome IS DISTINCT FROM OLD.paciente_nome
    OR NEW.paciente_cpf_mask IS DISTINCT FROM OLD.paciente_cpf_mask
    OR NEW.profissional_nome IS DISTINCT FROM OLD.profissional_nome
    OR NEW.profissional_crm IS DISTINCT FROM OLD.profissional_crm
    OR NEW.emitido_em IS DISTINCT FROM OLD.emitido_em
    OR NEW.emitido_por IS DISTINCT FROM OLD.emitido_por
  THEN
    RAISE EXCEPTION 'receita_imutavel: campos protegidos não podem ser alterados após emissão' USING ERRCODE = 'P0009';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_receita_imutavel
  BEFORE UPDATE ON public.receitas
  FOR EACH ROW EXECUTE FUNCTION public.fn_receita_imutavel();

CREATE TRIGGER trg_receitas_updated_at
  BEFORE UPDATE ON public.receita_contadores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ gerar_numero_receita ============
CREATE OR REPLACE FUNCTION public.gerar_numero_receita(p_uf text, p_serie text)
RETURNS TABLE(numero text, sequencia bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uf text := upper(btrim(coalesce(p_uf,'')));
  v_serie text := upper(btrim(coalesce(p_serie,'')));
  v_seq bigint;
BEGIN
  IF length(v_uf) <> 2 THEN RAISE EXCEPTION 'uf_invalida' USING ERRCODE = '22023'; END IF;
  IF v_serie NOT IN ('A','B') THEN RAISE EXCEPTION 'serie_invalida' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.receita_contadores (uf, serie, ultimo_numero)
  VALUES (v_uf, v_serie, 1)
  ON CONFLICT (uf, serie) DO UPDATE
    SET ultimo_numero = public.receita_contadores.ultimo_numero + 1,
        updated_at = now()
  RETURNING public.receita_contadores.ultimo_numero INTO v_seq;

  numero := format('%s-%s-%s', v_uf, v_serie, lpad(v_seq::text, 6, '0'));
  sequencia := v_seq;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.gerar_numero_receita(text, text) TO authenticated;

-- ============ verificar_receita (público) ============
CREATE OR REPLACE FUNCTION public.verificar_receita(p_numero text)
RETURNS TABLE(
  numero text,
  serie text,
  uf text,
  status text,
  paciente_mascarado text,
  profissional_nome text,
  profissional_crm text,
  profissional_uf text,
  profissional_conselho_tipo text,
  unidade_nome text,
  emitido_em timestamptz,
  validade_ate timestamptz,
  validade_dias int,
  cancelado_em timestamptz,
  cancelado_motivo text,
  utilizado_em timestamptz,
  hash_conteudo text,
  assinatura_curta text,
  medicamentos jsonb,
  eventos jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_num text := upper(btrim(coalesce(p_numero,'')));
  v_headers jsonb;
  v_ip text;
  v_ip_inet inet;
  v_ua text;
  v_rec public.receitas%ROWTYPE;
  v_paciente_masc text;
  v_parts text[];
BEGIN
  IF length(v_num) < 6 OR length(v_num) > 40 THEN RETURN; END IF;

  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;

  IF v_headers IS NOT NULL THEN
    v_ip := COALESCE(
      split_part(v_headers->>'x-forwarded-for', ',', 1),
      v_headers->>'x-real-ip',
      v_headers->>'cf-connecting-ip'
    );
    v_ip := NULLIF(btrim(v_ip), '');
    v_ua := v_headers->>'user-agent';
    IF v_ip IS NOT NULL THEN
      BEGIN v_ip_inet := v_ip::inet; EXCEPTION WHEN OTHERS THEN v_ip_inet := NULL; END;
    END IF;
  END IF;

  SELECT * INTO v_rec FROM public.receitas WHERE public.receitas.numero = v_num LIMIT 1;
  IF v_rec.id IS NULL THEN RETURN; END IF;

  -- expira automaticamente em leitura (sem persistir, para evitar custos de UPDATE em SELECT público)
  IF v_rec.status = 'valida' AND v_rec.emitido_em + (v_rec.validade_dias || ' days')::interval < now() THEN
    v_rec.status := 'expirada';
  END IF;

  -- máscara: primeiro nome + iniciais dos demais
  v_parts := regexp_split_to_array(v_rec.paciente_nome, '\s+');
  IF array_length(v_parts, 1) > 1 THEN
    v_paciente_masc := v_parts[1];
    FOR i IN 2..array_length(v_parts,1) LOOP
      v_paciente_masc := v_paciente_masc || ' ' || left(v_parts[i], 1) || '.';
    END LOOP;
  ELSE
    v_paciente_masc := v_rec.paciente_nome;
  END IF;

  -- log de verificação (não bloqueia)
  BEGIN
    INSERT INTO public.receita_logs (receita_id, evento, ip, user_agent, metadata)
    VALUES (v_rec.id, 'verificada', v_ip_inet, v_ua, jsonb_build_object('public', true));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  numero := v_rec.numero;
  serie := v_rec.serie;
  uf := v_rec.uf;
  status := v_rec.status;
  paciente_mascarado := v_paciente_masc;
  profissional_nome := v_rec.profissional_nome;
  profissional_crm := v_rec.profissional_crm;
  profissional_uf := v_rec.profissional_uf;
  profissional_conselho_tipo := v_rec.profissional_conselho_tipo;
  unidade_nome := v_rec.unidade_nome;
  emitido_em := v_rec.emitido_em;
  validade_ate := v_rec.emitido_em + (v_rec.validade_dias || ' days')::interval;
  validade_dias := v_rec.validade_dias;
  cancelado_em := v_rec.cancelado_em;
  cancelado_motivo := v_rec.cancelado_motivo;
  utilizado_em := v_rec.utilizado_em;
  hash_conteudo := v_rec.hash_conteudo;
  assinatura_curta := CASE WHEN v_rec.assinatura IS NULL THEN NULL
    ELSE left(v_rec.assinatura, 8) || '…' || right(v_rec.assinatura, 4) END;
  medicamentos := v_rec.medicamentos;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'evento', l.evento, 'created_at', l.created_at,
    'ip_mask', CASE WHEN l.ip IS NULL THEN NULL ELSE host(l.ip) END
  ) ORDER BY l.created_at DESC), '[]'::jsonb)
    INTO eventos
    FROM (
      SELECT evento, created_at, ip FROM public.receita_logs
       WHERE receita_id = v_rec.id ORDER BY created_at DESC LIMIT 5
    ) l;

  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.verificar_receita(text) TO anon, authenticated;
