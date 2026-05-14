-- ============================================================
-- Permissões por unidade (UBS)
-- ============================================================

-- 1) Profissional <-> Unidade (M:N)
CREATE TABLE public.profissional_unidades (
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profissional_id, unidade_id)
);

ALTER TABLE public.profissional_unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pu_admin_all" ON public.profissional_unidades
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "pu_select_staff" ON public.profissional_unidades
  FOR SELECT TO authenticated
  USING (public.is_authenticated_staff(auth.uid()));

CREATE INDEX idx_pu_unidade ON public.profissional_unidades(unidade_id);

-- 2) Recepcionista <-> Unidade
CREATE TABLE public.user_unidades (
  user_id uuid NOT NULL,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, unidade_id)
);

ALTER TABLE public.user_unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uu_admin_all" ON public.user_unidades
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "uu_select_self" ON public.user_unidades
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_uu_user ON public.user_unidades(user_id);

-- 3) Helper security definer: usuário pode acessar a unidade?
CREATE OR REPLACE FUNCTION public.user_can_access_unidade(_user uuid, _unidade uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user, 'admin')
    OR (
      _unidade IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.user_unidades WHERE user_id = _user AND unidade_id = _unidade)
    );
$$;

-- 4) Helper: profissional é visível ao usuário?
CREATE OR REPLACE FUNCTION public.user_can_see_profissional(_user uuid, _prof uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profissional_unidades pu
      JOIN public.user_unidades uu ON uu.unidade_id = pu.unidade_id
      WHERE pu.profissional_id = _prof AND uu.user_id = _user
    );
$$;

-- ============================================================
-- Atualiza RLS para reforçar permissões por unidade
-- ============================================================

-- profissionais
DROP POLICY IF EXISTS "prof_select_staff" ON public.profissionais;
CREATE POLICY "prof_select_staff" ON public.profissionais
  FOR SELECT TO authenticated
  USING (public.user_can_see_profissional(auth.uid(), id));

-- agendas_config: admin total; recepcionista só na unidade dele e respeitando o profissional
DROP POLICY IF EXISTS "agcfg_staff_all" ON public.agendas_config;

CREATE POLICY "agcfg_admin_all" ON public.agendas_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "agcfg_recep_rw" ON public.agendas_config
  FOR ALL TO authenticated
  USING (
    public.is_authenticated_staff(auth.uid())
    AND unidade_id IS NOT NULL
    AND public.user_can_access_unidade(auth.uid(), unidade_id)
  )
  WITH CHECK (
    public.is_authenticated_staff(auth.uid())
    AND unidade_id IS NOT NULL
    AND public.user_can_access_unidade(auth.uid(), unidade_id)
    AND public.user_can_see_profissional(auth.uid(), profissional_id)
  );

-- slots
DROP POLICY IF EXISTS "slots_staff_all" ON public.slots;

CREATE POLICY "slots_admin_all" ON public.slots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "slots_recep_rw" ON public.slots
  FOR ALL TO authenticated
  USING (
    public.is_authenticated_staff(auth.uid())
    AND unidade_id IS NOT NULL
    AND public.user_can_access_unidade(auth.uid(), unidade_id)
  )
  WITH CHECK (
    public.is_authenticated_staff(auth.uid())
    AND unidade_id IS NOT NULL
    AND public.user_can_access_unidade(auth.uid(), unidade_id)
  );

-- agendamentos: liga via slot
DROP POLICY IF EXISTS "ag_staff_all" ON public.agendamentos;

CREATE POLICY "ag_admin_all" ON public.agendamentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ag_recep_rw" ON public.agendamentos
  FOR ALL TO authenticated
  USING (
    public.is_authenticated_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.slots s
      WHERE s.id = agendamentos.slot_id
        AND s.unidade_id IS NOT NULL
        AND public.user_can_access_unidade(auth.uid(), s.unidade_id)
    )
  )
  WITH CHECK (
    public.is_authenticated_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.slots s
      WHERE s.id = agendamentos.slot_id
        AND s.unidade_id IS NOT NULL
        AND public.user_can_access_unidade(auth.uid(), s.unidade_id)
    )
  );

-- ============================================================
-- Reforço: gerar_slots agora propaga unidade do config
-- (já estava propagando; mantém)
-- ============================================================