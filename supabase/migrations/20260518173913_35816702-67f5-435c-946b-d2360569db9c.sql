-- 1) View cotas_uso: tira acesso público, mantém só authenticated
REVOKE ALL ON public.cotas_uso FROM anon, public;
GRANT SELECT ON public.cotas_uso TO authenticated;

-- 2) Trocar SECURITY DEFINER → INVOKER nas funções novas (RLS já é suficiente)
ALTER FUNCTION public.tme_aplicavel(uuid, public.classificacao_risco, uuid) SECURITY INVOKER;
ALTER FUNCTION public.fn_fila_exige_cns() SECURITY INVOKER;

-- 3) Revogar EXECUTE do anon nas funções novas
REVOKE EXECUTE ON FUNCTION public.tme_aplicavel(uuid, public.classificacao_risco, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.tme_aplicavel(uuid, public.classificacao_risco, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_fila_exige_cns() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.fn_cotas_normaliza_competencia() FROM anon, public;