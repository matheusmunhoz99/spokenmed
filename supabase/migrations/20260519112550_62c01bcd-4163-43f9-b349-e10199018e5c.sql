
-- ============================================================
-- FASE 1: estrutura para exportação e-SUS PEC (CDS/LEDI 7.4)
-- ============================================================

-- 1) UNIDADES: campos CNES/IBGE/endereço estruturado
ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS ibge_municipio text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS tipo_unidade text;

-- 2) NOVA TABELA: equipes (eSF/eAP/eSB)
CREATE TABLE IF NOT EXISTS public.equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  ine text NOT NULL,
  nome text NOT NULL,
  tipo_equipe text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipes_ine_uniq UNIQUE (ine)
);

CREATE INDEX IF NOT EXISTS idx_equipes_unidade ON public.equipes(unidade_id);

ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipes_admin_all ON public.equipes
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY equipes_select_staff ON public.equipes
  FOR SELECT TO authenticated
  USING (private.is_authenticated_staff(auth.uid()) AND private.user_can_access_unidade(auth.uid(), unidade_id));

CREATE TRIGGER trg_equipes_updated BEFORE UPDATE ON public.equipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_equipes AFTER INSERT OR UPDATE OR DELETE ON public.equipes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- 3) PROFISSIONAIS: CNS e vínculo a equipe
ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS cns text,
  ADD COLUMN IF NOT EXISTS equipe_id uuid REFERENCES public.equipes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profissionais_equipe ON public.profissionais(equipe_id);

-- 4) DOMICILIOS: campos LEDI FCD
ALTER TABLE public.domicilios
  ADD COLUMN IF NOT EXISTS cnes_unidade text,
  ADD COLUMN IF NOT EXISTS ine_equipe text,
  ADD COLUMN IF NOT EXISTS cns_responsavel text,
  ADD COLUMN IF NOT EXISTS cbo_responsavel text,
  ADD COLUMN IF NOT EXISTS data_cadastro date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS ficha_atualizacao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uuid_ficha uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS condicao_moradia text,
  ADD COLUMN IF NOT EXISTS localizacao text, -- 'urbana' | 'rural'
  ADD COLUMN IF NOT EXISTS sem_numero boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telefone_contato text,
  ADD COLUMN IF NOT EXISTS telefone_residencia text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS numero_familias integer,
  ADD COLUMN IF NOT EXISTS mudou_se boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS termo_recusa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fora_area boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS domicilios_uuid_ficha_uniq ON public.domicilios(uuid_ficha);

-- 5) FAMILIAS: campos LEDI
ALTER TABLE public.familias
  ADD COLUMN IF NOT EXISTS data_cadastro date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS mudou_se boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS responsavel_cns text;

-- 6) PACIENTES: campos LEDI FCI
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS raca_cor text,
  ADD COLUMN IF NOT EXISTS etnia text,
  ADD COLUMN IF NOT EXISTS nacionalidade text DEFAULT 'brasileira',
  ADD COLUMN IF NOT EXISTS pais_nascimento text,
  ADD COLUMN IF NOT EXISTS municipio_nascimento_ibge text,
  ADD COLUMN IF NOT EXISTS uf_nascimento text,
  ADD COLUMN IF NOT EXISTS escolaridade text,
  ADD COLUMN IF NOT EXISTS situacao_mercado_trabalho text,
  ADD COLUMN IF NOT EXISTS ocupacao_cbo text,
  ADD COLUMN IF NOT EXISTS orientacao_sexual text,
  ADD COLUMN IF NOT EXISTS identidade_genero text,
  ADD COLUMN IF NOT EXISTS frequenta_escola boolean,
  ADD COLUMN IF NOT EXISTS religiao text,
  ADD COLUMN IF NOT EXISTS povo_comunidade text,
  ADD COLUMN IF NOT EXISTS peso_nascimento numeric,
  ADD COLUMN IF NOT EXISTS condicoes_saude jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS em_situacao_rua jsonb,
  ADD COLUMN IF NOT EXISTS cidadao_outra_equipe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uuid_ficha_fci uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS pacientes_uuid_ficha_fci_uniq ON public.pacientes(uuid_ficha_fci);

-- 7) VISITAS: campos LEDI FAD
ALTER TABLE public.visitas_domiciliares
  ADD COLUMN IF NOT EXISTS cns_acs text,
  ADD COLUMN IF NOT EXISTS cbo_acs text,
  ADD COLUMN IF NOT EXISTS ine_equipe text,
  ADD COLUMN IF NOT EXISTS cnes_unidade text,
  ADD COLUMN IF NOT EXISTS microarea text,
  ADD COLUMN IF NOT EXISTS fora_area boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uuid_ficha uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS visitas_uuid_ficha_uniq ON public.visitas_domiciliares(uuid_ficha);

-- 8) NOVA TABELA: histórico de exportações e-SUS
CREATE TABLE IF NOT EXISTS public.esus_exportacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_por uuid NOT NULL,
  criado_por_email text,
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL,
  equipe_id uuid REFERENCES public.equipes(id) ON DELETE SET NULL,
  profissional_id uuid REFERENCES public.profissionais(id) ON DELETE SET NULL,
  profissional_cns text,
  profissional_cbo text,
  tipos_fichas text[] NOT NULL DEFAULT ARRAY['FCD']::text[],
  intervalo_inicio date,
  intervalo_fim date,
  total_fcd integer NOT NULL DEFAULT 0,
  total_fci integer NOT NULL DEFAULT 0,
  total_fad integer NOT NULL DEFAULT 0,
  arquivo_path text,
  arquivo_tamanho_bytes bigint,
  status text NOT NULL DEFAULT 'pendente',
  erro_msg text,
  lote_uuid uuid NOT NULL DEFAULT gen_random_uuid(),
  ledi_versao text NOT NULL DEFAULT '7.4',
  validacao_resultado jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esus_export_unidade ON public.esus_exportacoes(unidade_id);
CREATE INDEX IF NOT EXISTS idx_esus_export_created ON public.esus_exportacoes(created_at DESC);

ALTER TABLE public.esus_exportacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY esus_export_admin_all ON public.esus_exportacoes
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY esus_export_staff_select ON public.esus_exportacoes
  FOR SELECT TO authenticated
  USING (
    private.is_authenticated_staff(auth.uid())
    AND (unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), unidade_id))
  );

CREATE POLICY esus_export_staff_insert ON public.esus_exportacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_authenticated_staff(auth.uid())
    AND criado_por = auth.uid()
    AND (unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), unidade_id))
  );

CREATE POLICY esus_export_staff_update ON public.esus_exportacoes
  FOR UPDATE TO authenticated
  USING (criado_por = auth.uid())
  WITH CHECK (criado_por = auth.uid());

CREATE TRIGGER trg_esus_export_updated BEFORE UPDATE ON public.esus_exportacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_audit_esus_export AFTER INSERT OR UPDATE OR DELETE ON public.esus_exportacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- 9) BUCKET de Storage para arquivos gerados
INSERT INTO storage.buckets (id, name, public)
VALUES ('esus-exportacoes', 'esus-exportacoes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "esus_export_admin_all_files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'esus-exportacoes' AND private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'esus-exportacoes' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "esus_export_staff_select_files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'esus-exportacoes' AND private.is_authenticated_staff(auth.uid()));
