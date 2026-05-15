
REVOKE EXECUTE ON FUNCTION public.log_auth(text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_view(text, uuid, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_export(text, text, jsonb, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_auth(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_view(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_export(text, text, jsonb, text, text) TO authenticated;
