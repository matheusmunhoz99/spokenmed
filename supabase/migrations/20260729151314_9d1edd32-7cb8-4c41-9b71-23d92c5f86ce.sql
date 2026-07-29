CREATE TABLE public.integracao_lotes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origem text NOT NULL DEFAULT 'firebird',
  tabela text NOT NULL,
  total_registros integer NOT NULL DEFAULT 0,
  total_inseridos integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'recebido',
  erro_msg text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.integracao_registros (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lote_id uuid NOT NULL REFERENCES public.integracao_lotes(id) ON DELETE CASCADE,
  origem text NOT NULL DEFAULT 'firebird',
  tabela text NOT NULL,
  chave_origem text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  erro_msg text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX integracao_registros_unq ON public.integracao_registros (origem, tabela, chave_origem) WHERE chave_origem IS NOT NULL;
CREATE INDEX integracao_registros_lote_idx ON public.integracao_registros (lote_id);
CREATE INDEX integracao_registros_tabela_idx ON public.integracao_registros (tabela, status);

GRANT SELECT ON public.integracao_lotes TO authenticated;
GRANT ALL ON public.integracao_lotes TO service_role;
GRANT SELECT ON public.integracao_registros TO authenticated;
GRANT ALL ON public.integracao_registros TO service_role;

ALTER TABLE public.integracao_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integracao_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem lotes de integracao"
ON public.integracao_lotes FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins veem registros de integracao"
ON public.integracao_registros FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_integracao_lotes_updated_at BEFORE UPDATE ON public.integracao_lotes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_integracao_registros_updated_at BEFORE UPDATE ON public.integracao_registros
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();