-- Migration para Sincronização Bidirecional (Lovable ⟷ Firebird) em Tempo Real

CREATE TABLE IF NOT EXISTS public.integracao_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL,
  chave_origem text NOT NULL,
  acao text NOT NULL DEFAULT 'UPDATE',
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS integracao_outbox_status_idx ON public.integracao_outbox(status, created_at);

-- Trigger de Enfileiramento de Edição no Lovable -> Firebird
CREATE OR REPLACE FUNCTION public.queue_outbox_encaminhamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Se o registro veio do Firebird e foi editado no Lovable, gera ordem de Update para o Firebird
  IF NEW.codigo_origem_firebird IS NOT NULL AND (
     OLD.status IS DISTINCT FROM NEW.status OR
     OLD.prioridade IS DISTINCT FROM NEW.prioridade OR
     OLD.observacoes IS DISTINCT FROM NEW.observacoes
  ) THEN
    INSERT INTO public.integracao_outbox (
      tabela,
      chave_origem,
      acao,
      payload
    ) VALUES (
      'ENCAMINHAMENTO',
      NEW.codigo_origem_firebird,
      'UPDATE',
      jsonb_build_object(
        'CD_ENCAMINHAMENTO', NEW.codigo_origem_firebird,
        'SITUACAO', NEW.status,
        'PRIORIDADE', NEW.prioridade,
        'OBSERVACAO', COALESCE(NEW.observacoes, '')
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_outbox_encaminhamento ON public.encaminhamentos;
CREATE TRIGGER trigger_outbox_encaminhamento
  AFTER UPDATE ON public.encaminhamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_outbox_encaminhamento();
