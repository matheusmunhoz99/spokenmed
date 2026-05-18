
-- =========================================================
-- DOMICÍLIOS
-- =========================================================
CREATE TABLE public.domicilios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acs_user_id uuid NOT NULL,
  unidade_id uuid REFERENCES public.unidades(id),
  microarea text,
  -- endereço
  cep text,
  logradouro text NOT NULL,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  ponto_referencia text,
  -- gps obrigatório
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  gps_accuracy numeric,
  gps_capturado_em timestamptz NOT NULL,
  -- características CDS
  tipo_imovel text,            -- casa, apartamento, comodo, outro
  tipo_domicilio text,         -- proprio, alugado, cedido, ocupacao, situacao_rua, outro
  situacao_moradia text,       -- urbana, rural
  material_paredes text,       -- alvenaria, madeira_aparelhada, taipa, madeira_aproveitada, palha, outro
  num_moradores int,
  num_comodos int,
  num_dormitorios int,
  abastecimento_agua text,     -- rede, poço, cisterna, carro_pipa, outro
  agua_consumo text,           -- filtrada, fervida, clorada, mineral, sem_tratamento
  esgoto text,                 -- rede, fossa_septica, fossa_rudimentar, ceu_aberto, outro
  destino_lixo text,           -- coletado, queimado, enterrado, ceu_aberto, outro
  energia_eletrica boolean DEFAULT true,
  animais jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ["cao","gato","galinha",...]
  -- mídia
  foto_fachada text,
  assinatura_responsavel text,
  assinatura_recusada boolean NOT NULL DEFAULT false,
  assinatura_recusa_motivo text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_domicilios_acs ON public.domicilios(acs_user_id);
CREATE INDEX idx_domicilios_unidade ON public.domicilios(unidade_id);

ALTER TABLE public.domicilios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domicilios_admin_all" ON public.domicilios
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "domicilios_acs_own" ON public.domicilios
  FOR ALL TO authenticated
  USING (acs_user_id = auth.uid() AND private.has_role_text(auth.uid(), 'acs'))
  WITH CHECK (acs_user_id = auth.uid() AND private.has_role_text(auth.uid(), 'acs'));

CREATE POLICY "domicilios_staff_select" ON public.domicilios
  FOR SELECT TO authenticated
  USING (private.is_authenticated_staff(auth.uid())
         AND (unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), unidade_id)));

CREATE TRIGGER trg_domicilios_updated
  BEFORE UPDATE ON public.domicilios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- imutabilidade após 24h (exceto admin) — reaproveita fn_visita_imutavel
CREATE TRIGGER trg_domicilios_imutavel
  BEFORE UPDATE ON public.domicilios
  FOR EACH ROW EXECUTE FUNCTION public.fn_visita_imutavel();

-- =========================================================
-- FAMÍLIAS
-- =========================================================
CREATE TABLE public.familias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domicilio_id uuid NOT NULL REFERENCES public.domicilios(id) ON DELETE CASCADE,
  prontuario_familiar text,
  responsavel_paciente_id uuid REFERENCES public.pacientes(id),
  renda_familiar numeric,
  bolsa_familia boolean NOT NULL DEFAULT false,
  situacao_rua boolean NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_familias_domicilio ON public.familias(domicilio_id);

ALTER TABLE public.familias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "familias_admin_all" ON public.familias
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "familias_acs_own" ON public.familias
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.domicilios d WHERE d.id = familias.domicilio_id AND d.acs_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.domicilios d WHERE d.id = familias.domicilio_id AND d.acs_user_id = auth.uid()));

CREATE POLICY "familias_staff_select" ON public.familias
  FOR SELECT TO authenticated
  USING (private.is_authenticated_staff(auth.uid())
         AND EXISTS (SELECT 1 FROM public.domicilios d WHERE d.id = familias.domicilio_id
                       AND (d.unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), d.unidade_id))));

CREATE TRIGGER trg_familias_updated
  BEFORE UPDATE ON public.familias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- MEMBROS DA FAMÍLIA
-- =========================================================
CREATE TABLE public.familia_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id uuid NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id),
  parentesco text,             -- responsavel, conjuge, filho, pai, mae, irmao, avo, neto, outro
  is_responsavel boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (familia_id, paciente_id)
);
CREATE INDEX idx_familia_membros_familia ON public.familia_membros(familia_id);
CREATE INDEX idx_familia_membros_paciente ON public.familia_membros(paciente_id);

ALTER TABLE public.familia_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "familia_membros_admin_all" ON public.familia_membros
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "familia_membros_acs_own" ON public.familia_membros
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.familias f
    JOIN public.domicilios d ON d.id = f.domicilio_id
    WHERE f.id = familia_membros.familia_id AND d.acs_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.familias f
    JOIN public.domicilios d ON d.id = f.domicilio_id
    WHERE f.id = familia_membros.familia_id AND d.acs_user_id = auth.uid()
  ));

CREATE POLICY "familia_membros_staff_select" ON public.familia_membros
  FOR SELECT TO authenticated
  USING (private.is_authenticated_staff(auth.uid())
         AND EXISTS (
           SELECT 1 FROM public.familias f
           JOIN public.domicilios d ON d.id = f.domicilio_id
           WHERE f.id = familia_membros.familia_id
             AND (d.unidade_id IS NULL OR private.user_can_access_unidade(auth.uid(), d.unidade_id))
         ));

-- =========================================================
-- VISITAS: amarrar a domicílio/família
-- =========================================================
ALTER TABLE public.visitas_domiciliares
  ADD COLUMN IF NOT EXISTS domicilio_id uuid REFERENCES public.domicilios(id),
  ADD COLUMN IF NOT EXISTS familia_id uuid REFERENCES public.familias(id);

CREATE INDEX IF NOT EXISTS idx_visitas_domicilio ON public.visitas_domiciliares(domicilio_id);
CREATE INDEX IF NOT EXISTS idx_visitas_familia ON public.visitas_domiciliares(familia_id);

-- =========================================================
-- PERMISSÕES: módulo "domicilios"
-- =========================================================
INSERT INTO public.user_permissions (user_id, module, can_view, can_manage)
SELECT ur.user_id, 'domicilios', true, true
  FROM public.user_roles ur
 WHERE ur.role IN ('admin','acs')
ON CONFLICT (user_id, module) DO UPDATE SET can_view = true, can_manage = true;

INSERT INTO public.user_permissions (user_id, module, can_view, can_manage)
SELECT ur.user_id, 'domicilios', true, false
  FROM public.user_roles ur
 WHERE ur.role IN ('triagem','medico','recepcionista')
ON CONFLICT (user_id, module) DO UPDATE SET can_view = true, can_manage = false;
