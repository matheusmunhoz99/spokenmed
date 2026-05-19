
-- 1) Tables
ALTER TABLE public.fiorilli_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receita_contadores_admin_select ON public.receita_contadores;
CREATE POLICY receita_contadores_admin_select
  ON public.receita_contadores
  FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- 2) Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.cidadao_consultar(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cidadao_consultar_documentos(text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_ag_after_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_after_insert_hist() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_carimbos() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_reserva_slot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_set_codigo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ag_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_atendimento_janela_edicao() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_row() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_profile_set_assinatura_secret() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gen_agendamento_codigo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_numero_receita(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gerar_slots(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_auth(text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_export(text, text, jsonb, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_view(text, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_fichas_exportadas(uuid, uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tele_aceitar_gravacao(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tele_avaliar(text, integer, integer, text, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tele_paciente_entrar(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verificar_documento(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verificar_receita(text) FROM PUBLIC;

-- 3) Re-grant only where needed
GRANT EXECUTE ON FUNCTION public.cidadao_consultar(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cidadao_consultar_documentos(text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_documento(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_receita(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tele_aceitar_gravacao(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tele_avaliar(text, integer, integer, text, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tele_paciente_entrar(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gerar_numero_receita(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_slots(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_auth(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_export(text, text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_view(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_fichas_exportadas(uuid, uuid[], uuid[], uuid[]) TO authenticated;
