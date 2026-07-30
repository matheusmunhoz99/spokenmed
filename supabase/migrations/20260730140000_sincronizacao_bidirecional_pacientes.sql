-- Migration para Sincronização Bidirecional de Pacientes (Lovable -> CADSOCIAL Firebird)

CREATE OR REPLACE FUNCTION public.queue_outbox_paciente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Se o paciente veio do Firebird e teve nome, CPF, telefone ou nome da mãe alterado no Lovable
  IF NEW.codigo_origem_firebird IS NOT NULL AND (
     OLD.nome IS DISTINCT FROM NEW.nome OR
     OLD.cpf IS DISTINCT FROM NEW.cpf OR
     OLD.telefone IS DISTINCT FROM NEW.telefone OR
     OLD.nome_mae IS DISTINCT FROM NEW.nome_mae
  ) THEN
    INSERT INTO public.integracao_outbox (
      tabela, chave_origem, acao, payload
    ) VALUES (
      'CADSOCIAL',
      NEW.codigo_origem_firebird,
      'UPDATE',
      jsonb_build_object(
        'NMATRICULA', NEW.codigo_origem_firebird,
        'NOME', NEW.nome,
        'CPF', COALESCE(NEW.cpf, ''),
        'FONE', COALESCE(NEW.telefone, ''),
        'MAE', COALESCE(NEW.nome_mae, '')
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_outbox_paciente ON public.pacientes;
CREATE TRIGGER trigger_outbox_paciente
  AFTER UPDATE ON public.pacientes
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_outbox_paciente();
