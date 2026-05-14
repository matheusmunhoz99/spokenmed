
-- 1) Add 'medico' to app_role enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'medico'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'medico';
  END IF;
END$$;

-- 2) user_permissions table
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_manage boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perm_admin_all" ON public.user_permissions;
CREATE POLICY "perm_admin_all" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "perm_select_self" ON public.user_permissions;
CREATE POLICY "perm_select_self" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3) has_permission helper
CREATE OR REPLACE FUNCTION public.has_permission(_user uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user
        AND module = _module
        AND (
          (_action = 'view' AND can_view)
          OR (_action = 'manage' AND can_manage)
        )
    );
$$;

-- 4) Link a medico user to a profissional record
ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profissionais_user_id_key
  ON public.profissionais(user_id) WHERE user_id IS NOT NULL;
