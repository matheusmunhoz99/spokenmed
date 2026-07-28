CREATE TABLE public.assinaturas_pdf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo text NOT NULL UNIQUE,
  nome_arquivo text NOT NULL,
  storage_path text,
  storage_path_original text,
  tamanho_bytes bigint,
  hash_original text NOT NULL,
  hash_assinado text,
  motivo text,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL,
  assinante_user_id uuid NOT NULL,
  assinante_nome text NOT NULL,
  assinante_email text,
  assinante_conselho text,
  assinante_cbo text,
  ip inet,
  user_agent text,
  assinatura text NOT NULL,
  assinatura_payload_sha text,
  assinado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assinaturas_pdf_user ON public.assinaturas_pdf(assinante_user_id, assinado_em DESC);
CREATE INDEX idx_assinaturas_pdf_agendamento ON public.assinaturas_pdf(agendamento_id);

GRANT SELECT, INSERT, UPDATE ON public.assinaturas_pdf TO authenticated;
GRANT ALL ON public.assinaturas_pdf TO service_role;

ALTER TABLE public.assinaturas_pdf ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode ver assinaturas"
  ON public.assinaturas_pdf FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Usuario registra assinatura propria"
  ON public.assinaturas_pdf FOR INSERT TO authenticated
  WITH CHECK (assinante_user_id = auth.uid());

CREATE POLICY "Usuario completa upload da propria assinatura"
  ON public.assinaturas_pdf FOR UPDATE TO authenticated
  USING (assinante_user_id = auth.uid())
  WITH CHECK (assinante_user_id = auth.uid());

CREATE POLICY "Admin pode excluir assinatura"
  ON public.assinaturas_pdf FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_assinaturas_pdf_updated_at
  BEFORE UPDATE ON public.assinaturas_pdf
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.verificar_assinatura_pdf(p_protocolo text)
RETURNS TABLE(
  protocolo text,
  nome_arquivo text,
  motivo text,
  assinante_nome text,
  assinante_conselho text,
  assinante_email_mask text,
  unidade_nome text,
  ip_mask text,
  hash_original text,
  assinatura_curta text,
  assinado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.protocolo,
    a.nome_arquivo,
    a.motivo,
    a.assinante_nome,
    a.assinante_conselho,
    CASE WHEN a.assinante_email IS NULL THEN NULL
         ELSE left(a.assinante_email, 2) || '***@' || split_part(a.assinante_email, '@', 2) END,
    u.nome,
    CASE WHEN a.ip IS NULL THEN NULL
         ELSE regexp_replace(host(a.ip), '\.\d+$', '.***') END,
    a.hash_original,
    upper(left(a.assinatura, 16)),
    a.assinado_em
  FROM public.assinaturas_pdf a
  LEFT JOIN public.unidades u ON u.id = a.unidade_id
  WHERE upper(a.protocolo) = upper(trim(p_protocolo))
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.verificar_assinatura_pdf(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_assinatura_pdf(text) TO anon, authenticated;