-- Migration Resiliente para Sincronização Bidirecional (Lovable -> Firebird)

CREATE TABLE IF NOT EXISTS public.encaminhamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_origem_firebird text UNIQUE,
  paciente_id uuid REFERENCES public.pacientes(id),
  profissional_id uuid REFERENCES public.profissionais(id),
  unidade_id uuid REFERENCES public.unidades(id),
  especialidade_id uuid REFERENCES public.especialidades(id),
  status text NOT NULL DEFAULT 'aguardando',
  prioridade text NOT NULL DEFAULT 'normal',
  observacoes text,
  sincronizado_firebird boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

-- Trigger de retorno no integracao_registros (quando editado via tabela de trânsito)
CREATE OR REPLACE FUNCTION public.queue_outbox_registros()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF UPPER(COALESCE(NEW.tabela, '')) = 'ENCAMINHAMENTO' AND NEW.chave_origem IS NOT NULL THEN
    INSERT INTO public.integracao_outbox (
      tabela, chave_origem, acao, payload
    ) VALUES (
      'ENCAMINHAMENTO',
      NEW.chave_origem,
      'UPDATE',
      jsonb_build_object(
        'CD_ENCAMINHAMENTO', NEW.chave_origem,
        'SITUACAO', COALESCE(NEW.payload->>'SITUACAO', NEW.payload->>'STATUS', 'aguardando'),
        'PRIORIDADE', COALESCE(NEW.payload->>'PRIORIDADE', 'normal'),
        'OBSERVACAO', COALESCE(NEW.payload->>'OBSERVACAO', NEW.payload->>'OBSERVACOES', '')
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_outbox_registros ON public.integracao_registros;
CREATE TRIGGER trigger_outbox_registros
  AFTER UPDATE ON public.integracao_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_outbox_registros();

-- Trigger de retorno na tabela encaminhamentos
CREATE OR REPLACE FUNCTION public.queue_outbox_encaminhamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.codigo_origem_firebird IS NOT NULL THEN
    INSERT INTO public.integracao_outbox (
      tabela, chave_origem, acao, payload
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
