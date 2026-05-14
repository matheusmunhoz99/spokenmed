
-- 1) Bucket privado para anexos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anexos-agendamentos',
  'anexos-agendamentos',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Enum de categoria
DO $$ BEGIN
  CREATE TYPE public.anexo_categoria AS ENUM ('pedido_medico','exame','documento','foto','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Tabela de metadados
CREATE TABLE IF NOT EXISTS public.agendamento_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL,
  paciente_id uuid,
  unidade_id uuid,
  storage_path text NOT NULL UNIQUE,
  nome_original text NOT NULL,
  mime text NOT NULL,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 10485760),
  categoria public.anexo_categoria NOT NULL DEFAULT 'documento',
  descricao text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);

CREATE INDEX IF NOT EXISTS anexos_agendamento_idx ON public.agendamento_anexos(agendamento_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS anexos_paciente_idx ON public.agendamento_anexos(paciente_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS anexos_unidade_idx ON public.agendamento_anexos(unidade_id);
CREATE INDEX IF NOT EXISTS anexos_created_idx ON public.agendamento_anexos(created_at DESC);

-- 4) RLS na tabela
ALTER TABLE public.agendamento_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anexos_admin_all ON public.agendamento_anexos;
CREATE POLICY anexos_admin_all ON public.agendamento_anexos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS anexos_staff_select ON public.agendamento_anexos;
CREATE POLICY anexos_staff_select ON public.agendamento_anexos
  FOR SELECT TO authenticated
  USING (
    public.is_authenticated_staff(auth.uid())
    AND (unidade_id IS NULL OR public.user_can_access_unidade(auth.uid(), unidade_id))
  );

DROP POLICY IF EXISTS anexos_staff_insert ON public.agendamento_anexos;
CREATE POLICY anexos_staff_insert ON public.agendamento_anexos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_authenticated_staff(auth.uid())
    AND uploaded_by = auth.uid()
    AND (unidade_id IS NULL OR public.user_can_access_unidade(auth.uid(), unidade_id))
    AND EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.id = agendamento_id)
  );

-- Soft-delete: staff pode marcar deleted_at de anexos de sua unidade
DROP POLICY IF EXISTS anexos_staff_update ON public.agendamento_anexos;
CREATE POLICY anexos_staff_update ON public.agendamento_anexos
  FOR UPDATE TO authenticated
  USING (
    public.is_authenticated_staff(auth.uid())
    AND (unidade_id IS NULL OR public.user_can_access_unidade(auth.uid(), unidade_id))
  )
  WITH CHECK (
    public.is_authenticated_staff(auth.uid())
    AND (unidade_id IS NULL OR public.user_can_access_unidade(auth.uid(), unidade_id))
  );

-- 5) Trigger de auditoria
DROP TRIGGER IF EXISTS trg_audit_agendamento_anexos ON public.agendamento_anexos;
CREATE TRIGGER trg_audit_agendamento_anexos
  AFTER INSERT OR UPDATE OR DELETE ON public.agendamento_anexos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- 6) RLS no bucket (storage.objects). Caminho convencionado: {unidade_id}/{agendamento_id}/{uuid}_{filename}
DROP POLICY IF EXISTS "anexos_storage_select" ON storage.objects;
CREATE POLICY "anexos_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'anexos-agendamentos'
    AND (
      public.has_role(auth.uid(),'admin')
      OR (
        public.is_authenticated_staff(auth.uid())
        AND public.user_can_access_unidade(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "anexos_storage_insert" ON storage.objects;
CREATE POLICY "anexos_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'anexos-agendamentos'
    AND (
      public.has_role(auth.uid(),'admin')
      OR (
        public.is_authenticated_staff(auth.uid())
        AND public.user_can_access_unidade(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  );

DROP POLICY IF EXISTS "anexos_storage_delete" ON storage.objects;
CREATE POLICY "anexos_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'anexos-agendamentos'
    AND (
      public.has_role(auth.uid(),'admin')
      OR (
        public.is_authenticated_staff(auth.uid())
        AND public.user_can_access_unidade(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  );
