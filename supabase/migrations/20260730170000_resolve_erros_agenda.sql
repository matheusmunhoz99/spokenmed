-- Mantém o histórico de falhas sem exibir como pendente um registro que já
-- foi corrigido e materializado por um reenvio idempotente.

ALTER TABLE public.integracao_materializacao_erros
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE OR REPLACE FUNCTION public.resolver_erro_materializacao_agenda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF upper(coalesce(NEW.tabela, '')) = 'AGENDAMENTO'
     AND EXISTS (
       SELECT 1
       FROM public.agendamentos a
       WHERE a.codigo_origem_firebird = NEW.chave_origem
     )
  THEN
    UPDATE public.integracao_materializacao_erros
    SET resolved_at = coalesce(resolved_at, now())
    WHERE integracao_registro_id = NEW.id
      AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_resolver_erro_materializacao_agenda
  ON public.integracao_registros;
CREATE TRIGGER zz_resolver_erro_materializacao_agenda
  AFTER INSERT OR UPDATE OF payload ON public.integracao_registros
  FOR EACH ROW
  WHEN (upper(NEW.tabela) = 'AGENDAMENTO')
  EXECUTE FUNCTION public.resolver_erro_materializacao_agenda();

UPDATE public.integracao_materializacao_erros e
SET resolved_at = coalesce(e.resolved_at, now())
WHERE e.resolved_at IS NULL
  AND upper(e.tabela) = 'AGENDAMENTO'
  AND EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.codigo_origem_firebird = e.chave_origem
  );
