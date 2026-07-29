CREATE TYPE public.leito_situacao AS ENUM ('livre','ocupado','higienizacao','bloqueado','manutencao');
CREATE TYPE public.internacao_status AS ENUM ('pendente','aprovada','recusada','alta','cancelada');

CREATE TABLE public.leitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  ala text,
  quarto text NOT NULL,
  numero text NOT NULL,
  tipo text NOT NULL DEFAULT 'clinico',
  situacao public.leito_situacao NOT NULL DEFAULT 'livre',
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, quarto, numero)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leitos TO authenticated;
GRANT ALL ON public.leitos TO service_role;
ALTER TABLE public.leitos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitos_select" ON public.leitos FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','view'));
CREATE POLICY "leitos_insert" ON public.leitos FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','manage'));
CREATE POLICY "leitos_update" ON public.leitos FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','manage'))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','manage'));
CREATE POLICY "leitos_delete" ON public.leitos FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','manage'));

CREATE TABLE public.internacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  leito_id uuid REFERENCES public.leitos(id) ON DELETE SET NULL,
  motivo text NOT NULL,
  cid10 text,
  status public.internacao_status NOT NULL DEFAULT 'pendente',
  prioridade text NOT NULL DEFAULT 'normal',
  previsao_dias integer,
  solicitado_por uuid,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  aprovado_por uuid,
  aprovado_em timestamptz,
  recusa_motivo text,
  data_admissao timestamptz,
  data_alta timestamptz,
  alta_motivo text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internacoes_unidade ON public.internacoes(unidade_id);
CREATE INDEX idx_internacoes_status ON public.internacoes(status);
CREATE UNIQUE INDEX idx_internacoes_leito_ativo ON public.internacoes(leito_id)
  WHERE leito_id IS NOT NULL AND status IN ('pendente','aprovada');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internacoes TO authenticated;
GRANT ALL ON public.internacoes TO service_role;
ALTER TABLE public.internacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internacoes_select" ON public.internacoes FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','view'));
CREATE POLICY "internacoes_insert" ON public.internacoes FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','manage'));
CREATE POLICY "internacoes_update" ON public.internacoes FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','manage'))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','manage'));
CREATE POLICY "internacoes_delete" ON public.internacoes FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'leitos','manage'));

CREATE TRIGGER trg_leitos_updated BEFORE UPDATE ON public.leitos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_internacoes_updated BEFORE UPDATE ON public.internacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.fn_internacao_sync_leito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'aprovada' AND OLD.status IS DISTINCT FROM 'aprovada' THEN
    IF NEW.data_admissao IS NULL THEN NEW.data_admissao := now(); END IF;
    IF NEW.aprovado_em IS NULL THEN NEW.aprovado_em := now(); END IF;
    IF NEW.aprovado_por IS NULL THEN NEW.aprovado_por := auth.uid(); END IF;
  END IF;

  IF NEW.status IN ('alta','recusada','cancelada') THEN
    IF NEW.status = 'alta' AND NEW.data_alta IS NULL THEN NEW.data_alta := now(); END IF;
    IF NEW.leito_id IS NOT NULL THEN
      UPDATE public.leitos SET situacao = 'higienizacao' WHERE id = NEW.leito_id AND situacao = 'ocupado';
    END IF;
  ELSIF NEW.status = 'aprovada' AND NEW.leito_id IS NOT NULL THEN
    UPDATE public.leitos SET situacao = 'ocupado' WHERE id = NEW.leito_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.leito_id IS NOT NULL AND NEW.leito_id IS DISTINCT FROM OLD.leito_id THEN
    UPDATE public.leitos SET situacao = 'higienizacao' WHERE id = OLD.leito_id AND situacao = 'ocupado';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_internacao_sync_leito() FROM PUBLIC;

CREATE TRIGGER trg_internacao_sync_leito
  BEFORE INSERT OR UPDATE ON public.internacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_internacao_sync_leito();