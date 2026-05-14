
-- Garantir search_path em todas as funções
ALTER FUNCTION public.fn_fila_check_link() SET search_path = public;
ALTER FUNCTION public.set_audit_context(text, text, text) SET search_path = public;

-- Revogar execução de PUBLIC/anon nas SECURITY DEFINER
REVOKE ALL ON FUNCTION public.log_view(text, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_auth(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_export(text, text, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_audit_context(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_audit_row() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ag_reserva_slot() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ag_status_change() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ag_after_delete() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fila_check_link() FROM PUBLIC, anon;

-- Reconceder apenas para authenticated nas que o app chama explicitamente
GRANT EXECUTE ON FUNCTION public.log_view(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_auth(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_export(text, text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_audit_context(text, text, text) TO authenticated;
