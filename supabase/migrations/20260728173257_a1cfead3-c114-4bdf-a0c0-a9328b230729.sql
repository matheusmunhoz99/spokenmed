-- 1) atendimentos: leitura restrita
DROP POLICY IF EXISTS atendimentos_select_auth ON public.atendimentos;
CREATE POLICY atendimentos_select_scoped ON public.atendimentos
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR auth.uid() = criado_por
  OR (unidade_id IS NOT NULL AND private.is_authenticated_staff(auth.uid()) AND private.user_can_access_unidade(auth.uid(), unidade_id))
  OR (profissional_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.profissionais pr
        WHERE pr.id = atendimentos.profissional_id AND pr.user_id = auth.uid()
      ))
);

-- 2) assinaturas_pdf: leitura restrita
DROP POLICY IF EXISTS "Staff pode ver assinaturas" ON public.assinaturas_pdf;
CREATE POLICY assinaturas_pdf_select_scoped ON public.assinaturas_pdf
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR assinante_user_id = auth.uid()
  OR (unidade_id IS NOT NULL AND private.is_authenticated_staff(auth.uid()) AND private.user_can_access_unidade(auth.uid(), unidade_id))
);

-- 3) cotas_procedimento: leitura escopada por unidade
DROP POLICY IF EXISTS cotas_proc_read ON public.cotas_procedimento;
CREATE POLICY cotas_proc_select_scoped ON public.cotas_procedimento
FOR SELECT TO authenticated
USING (
  private.is_authenticated_staff(auth.uid())
  AND private.user_can_access_unidade(auth.uid(), unidade_id)
);

-- 4) funções SECURITY DEFINER: remover acesso indevido
REVOKE ALL ON FUNCTION public.fn_ag_valida_cota() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consumo_cota(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consumo_cota(uuid, uuid, uuid, date) TO authenticated;