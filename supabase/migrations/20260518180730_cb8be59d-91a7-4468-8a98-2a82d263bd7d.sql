
-- =====================================================
-- 1) Tabela TRIAGENS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.triagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL UNIQUE,
  paciente_id uuid NOT NULL,
  unidade_id uuid,
  triado_por uuid,
  triado_em timestamptz NOT NULL DEFAULT now(),
  classificacao_risco public.classificacao_risco NOT NULL,
  queixa_principal text,
  pa_sistolica integer,
  pa_diastolica integer,
  fc integer,
  fr integer,
  temperatura numeric(4,1),
  sato2 integer,
  glicemia integer,
  dor integer,
  peso numeric(5,2),
  altura numeric(4,2),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT triagens_dor_range CHECK (dor IS NULL OR (dor BETWEEN 0 AND 10)),
  CONSTRAINT triagens_sato2_range CHECK (sato2 IS NULL OR (sato2 BETWEEN 0 AND 100))
);

CREATE INDEX IF NOT EXISTS idx_triagens_agendamento ON public.triagens(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_triagens_paciente ON public.triagens(paciente_id);
CREATE INDEX IF NOT EXISTS idx_triagens_unidade ON public.triagens(unidade_id);

ALTER TABLE public.triagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS triagens_admin_all ON public.triagens;
CREATE POLICY triagens_admin_all ON public.triagens
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS triagens_staff_rw ON public.triagens;
CREATE POLICY triagens_staff_rw ON public.triagens
  FOR ALL TO authenticated
  USING (
    private.is_authenticated_staff(auth.uid())
    AND (unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), unidade_id))
  )
  WITH CHECK (
    private.is_authenticated_staff(auth.uid())
    AND (unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), unidade_id))
  );

DROP TRIGGER IF EXISTS trg_triagens_updated_at ON public.triagens;
CREATE TRIGGER trg_triagens_updated_at BEFORE UPDATE ON public.triagens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_triagens_audit ON public.triagens;
CREATE TRIGGER trg_triagens_audit AFTER INSERT OR UPDATE OR DELETE ON public.triagens
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- =====================================================
-- 2) Criação dos dois usuários de exemplo
-- =====================================================
DO $$
DECLARE
  v_unidade uuid := 'fb4a0da0-9cc8-40e1-bef0-bf80b3146807';  -- ESF Rio Claro Módulo I (Centro)
  v_tri_id uuid;
  v_acs_id uuid;
BEGIN
  -- Enfermeira de Triagem
  SELECT id INTO v_tri_id FROM auth.users WHERE email = 'enfermeira.triagem@spokenmed.local';
  IF v_tri_id IS NULL THEN
    v_tri_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_tri_id, 'authenticated', 'authenticated',
      'enfermeira.triagem@spokenmed.local',
      crypt('Triagem@2026', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nome":"Enfermeira de Triagem","cargo":"Enfermeira"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_tri_id,
      jsonb_build_object('sub', v_tri_id::text, 'email', 'enfermeira.triagem@spokenmed.local', 'email_verified', true),
      'email', 'enfermeira.triagem@spokenmed.local', now(), now(), now()
    );
  END IF;

  -- atualiza papel para triagem
  DELETE FROM public.user_roles WHERE user_id = v_tri_id;
  INSERT INTO public.user_roles(user_id, role) VALUES (v_tri_id, 'triagem');

  DELETE FROM public.user_unidades WHERE user_id = v_tri_id;
  INSERT INTO public.user_unidades(user_id, unidade_id) VALUES (v_tri_id, v_unidade);

  DELETE FROM public.user_permissions WHERE user_id = v_tri_id;
  INSERT INTO public.user_permissions(user_id, module, can_view, can_manage) VALUES
    (v_tri_id, 'agenda_dia', true, false),
    (v_tri_id, 'painel', true, false),
    (v_tri_id, 'fila', true, true),
    (v_tri_id, 'recepcao', true, true),
    (v_tri_id, 'triagem', true, true),
    (v_tri_id, 'pacientes', true, true);

  -- Agente Comunitário de Saúde
  SELECT id INTO v_acs_id FROM auth.users WHERE email = 'acs.maria@spokenmed.local';
  IF v_acs_id IS NULL THEN
    v_acs_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_acs_id, 'authenticated', 'authenticated',
      'acs.maria@spokenmed.local',
      crypt('Acs@2026', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nome":"Maria - Agente Comunitária","cargo":"Agente Comunitário de Saúde"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_acs_id,
      jsonb_build_object('sub', v_acs_id::text, 'email', 'acs.maria@spokenmed.local', 'email_verified', true),
      'email', 'acs.maria@spokenmed.local', now(), now(), now()
    );
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_acs_id;
  INSERT INTO public.user_roles(user_id, role) VALUES (v_acs_id, 'acs');

  DELETE FROM public.user_unidades WHERE user_id = v_acs_id;
  INSERT INTO public.user_unidades(user_id, unidade_id) VALUES (v_acs_id, v_unidade);

  DELETE FROM public.user_permissions WHERE user_id = v_acs_id;
  INSERT INTO public.user_permissions(user_id, module, can_view, can_manage) VALUES
    (v_acs_id, 'visitas', true, true),
    (v_acs_id, 'pacientes', true, false);
END $$;
