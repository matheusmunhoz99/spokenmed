
CREATE OR REPLACE FUNCTION private.user_can_see_profissional(_user uuid, _prof uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT
    private.has_role(_user, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profissional_unidades pu
      JOIN public.user_unidades uu ON uu.unidade_id = pu.unidade_id
      WHERE pu.profissional_id = _prof AND uu.user_id = _user
    );
$$;

CREATE OR REPLACE FUNCTION private.user_can_access_unidade(_user uuid, _unidade uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT
    private.has_role(_user, 'admin'::public.app_role)
    OR (
      _unidade IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.user_unidades WHERE user_id = _user AND unidade_id = _unidade)
    );
$$;

CREATE OR REPLACE FUNCTION private.has_permission(_user uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT
    private.has_role(_user, 'admin'::public.app_role)
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
