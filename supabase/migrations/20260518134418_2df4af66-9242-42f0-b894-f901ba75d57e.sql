
-- Tabela de documentos emitidos
CREATE TABLE IF NOT EXISTS public.documentos_emitidos (
  protocolo text PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('receita','atestado','sadt','lme','comprovante')),
  paciente_nome text NOT NULL,
  paciente_cpf_mask text,
  profissional_nome text NOT NULL,
  profissional_conselho text,
  profissional_cbo text,
  unidade_nome text,
  unidade_cnes text,
  agendamento_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  emitido_por uuid,
  emitido_por_email text,
  unidade_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_created_at ON public.documentos_emitidos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_unidade ON public.documentos_emitidos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_agendamento ON public.documentos_emitidos(agendamento_id);

ALTER TABLE public.documentos_emitidos ENABLE ROW LEVEL SECURITY;

-- Admin: tudo
CREATE POLICY "docs_admin_all" ON public.documentos_emitidos
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Staff: select da própria unidade
CREATE POLICY "docs_staff_select" ON public.documentos_emitidos
  FOR SELECT TO authenticated
  USING (
    private.is_authenticated_staff(auth.uid())
    AND (unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), unidade_id))
  );

-- Staff: insert se for o próprio emissor
CREATE POLICY "docs_staff_insert" ON public.documentos_emitidos
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_authenticated_staff(auth.uid())
    AND emitido_por = auth.uid()
    AND (unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), unidade_id))
  );

-- RPC pública: verifica documento pelo protocolo (sem expor PII completa)
CREATE OR REPLACE FUNCTION public.verificar_documento(p_protocolo text)
RETURNS TABLE (
  protocolo text,
  tipo text,
  paciente_nome_iniciais text,
  paciente_cpf_mask text,
  profissional_nome text,
  profissional_conselho text,
  unidade_nome text,
  unidade_cnes text,
  emitido_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cod text := upper(btrim(coalesce(p_protocolo, '')));
BEGIN
  IF length(v_cod) < 6 OR length(v_cod) > 40 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.protocolo,
    d.tipo,
    -- Mostra primeiro nome + iniciais do restante
    (
      split_part(d.paciente_nome, ' ', 1) || ' ' ||
      regexp_replace(
        substring(d.paciente_nome from position(' ' in d.paciente_nome) + 1),
        '([A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ]*)',
        '\1.', 'g'
      )
    )::text AS paciente_nome_iniciais,
    d.paciente_cpf_mask,
    d.profissional_nome,
    d.profissional_conselho,
    d.unidade_nome,
    d.unidade_cnes,
    d.created_at AS emitido_em
  FROM public.documentos_emitidos d
  WHERE d.protocolo = v_cod
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_documento(text) TO anon, authenticated;
