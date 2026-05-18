-- 1) Novos roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'triagem';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'acs';

-- 2) Atualizar is_authenticated_staff para incluir triagem e acs (via ::text para evitar dependência de enum recém-adicionado)
CREATE OR REPLACE FUNCTION private.is_authenticated_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'private','public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','recepcionista','medico','triagem','acs')
  );
$$;

-- 3) Helper para checar role por texto (evita necessidade de cast de enum recém-criado)
CREATE OR REPLACE FUNCTION private.has_role_text(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'private','public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role);
$$;

-- 4) Tabela visitas_domiciliares
CREATE TABLE IF NOT EXISTS public.visitas_domiciliares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL,
  acs_user_id uuid NOT NULL,
  unidade_id uuid,
  data_visita date NOT NULL DEFAULT CURRENT_DATE,
  turno text NOT NULL CHECK (turno IN ('manha','tarde','noite')),
  motivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  acompanhamentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  controle_ambiental jsonb NOT NULL DEFAULT '[]'::jsonb,
  desfecho text NOT NULL CHECK (desfecho IN ('visita_realizada','visita_recusada','ausente')),
  anti_vetorial boolean NOT NULL DEFAULT false,
  peso numeric(5,2),
  altura numeric(4,2),
  pa_sistolica integer,
  pa_diastolica integer,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  gps_accuracy numeric(8,2),
  gps_capturado_em timestamptz NOT NULL,
  endereco_visitado text,
  observacoes text,
  assinatura_paciente text,
  assinatura_paciente_em timestamptz,
  assinatura_recusada boolean NOT NULL DEFAULT false,
  assinatura_recusa_motivo text,
  fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fotos_max_3 CHECK (jsonb_array_length(fotos) <= 3),
  CONSTRAINT assinatura_ou_recusa CHECK (
    assinatura_paciente IS NOT NULL OR assinatura_recusada = true
  )
);

CREATE INDEX IF NOT EXISTS idx_visitas_paciente ON public.visitas_domiciliares(paciente_id);
CREATE INDEX IF NOT EXISTS idx_visitas_acs ON public.visitas_domiciliares(acs_user_id);
CREATE INDEX IF NOT EXISTS idx_visitas_data ON public.visitas_domiciliares(data_visita DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_unidade ON public.visitas_domiciliares(unidade_id);

ALTER TABLE public.visitas_domiciliares ENABLE ROW LEVEL SECURITY;

-- 5) RLS
CREATE POLICY visitas_admin_all ON public.visitas_domiciliares
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role));

CREATE POLICY visitas_acs_own ON public.visitas_domiciliares
  FOR ALL TO authenticated
  USING (acs_user_id = auth.uid() AND private.has_role_text(auth.uid(),'acs'))
  WITH CHECK (acs_user_id = auth.uid() AND private.has_role_text(auth.uid(),'acs'));

CREATE POLICY visitas_staff_select ON public.visitas_domiciliares
  FOR SELECT TO authenticated
  USING (
    private.is_authenticated_staff(auth.uid())
    AND (unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), unidade_id))
  );

-- 6) Triggers
CREATE TRIGGER visitas_set_updated
  BEFORE UPDATE ON public.visitas_domiciliares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.fn_visita_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.created_at < now() - interval '24 hours' AND NOT private.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'visita_imutavel: prazo de edição de 24h expirou' USING ERRCODE = 'P0030';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER visitas_imutavel
  BEFORE UPDATE ON public.visitas_domiciliares
  FOR EACH ROW EXECUTE FUNCTION public.fn_visita_imutavel();

CREATE TRIGGER visitas_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.visitas_domiciliares
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- 7) Storage bucket para fotos das visitas
INSERT INTO storage.buckets (id, name, public)
VALUES ('visitas-fotos', 'visitas-fotos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "visitas_fotos_acs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visitas-fotos'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND private.has_role_text(auth.uid(),'acs')
  );

CREATE POLICY "visitas_fotos_acs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'visitas-fotos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "visitas_fotos_acs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'visitas-fotos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "visitas_fotos_staff_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'visitas-fotos'
    AND private.is_authenticated_staff(auth.uid())
  );

CREATE POLICY "visitas_fotos_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'visitas-fotos' AND private.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (bucket_id = 'visitas-fotos' AND private.has_role(auth.uid(),'admin'::public.app_role));