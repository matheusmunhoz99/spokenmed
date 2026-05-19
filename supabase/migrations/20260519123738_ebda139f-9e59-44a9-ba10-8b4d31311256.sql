
-- Enum de status de envio
DO $$ BEGIN
  CREATE TYPE public.ficha_status_envio AS ENUM ('pendente','exportado','desatualizado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Colunas em atendimentos
ALTER TABLE public.atendimentos
  ADD COLUMN IF NOT EXISTS status_envio public.ficha_status_envio NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS exportado_em timestamptz,
  ADD COLUMN IF NOT EXISTS exportacao_id uuid REFERENCES public.esus_exportacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_atendimentos_status_envio ON public.atendimentos(status_envio) WHERE status_envio <> 'exportado';

-- Colunas em pacientes (FCI)
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS status_envio public.ficha_status_envio NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS exportado_em timestamptz,
  ADD COLUMN IF NOT EXISTS exportacao_id uuid REFERENCES public.esus_exportacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_status_envio ON public.pacientes(status_envio) WHERE status_envio <> 'exportado';

-- Colunas em domicilios (FCD)
ALTER TABLE public.domicilios
  ADD COLUMN IF NOT EXISTS status_envio public.ficha_status_envio NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS exportado_em timestamptz,
  ADD COLUMN IF NOT EXISTS exportacao_id uuid REFERENCES public.esus_exportacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_domicilios_status_envio ON public.domicilios(status_envio) WHERE status_envio <> 'exportado';

-- Trigger: janela de 2h para reabrir/editar atendimento
CREATE OR REPLACE FUNCTION public.fn_atendimento_janela_edicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- admin pode tudo
  IF private.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Marcação de exportado é feita por trigger do exportador (skip se for só status_envio mudando para exportado)
  IF NEW.status_envio = 'exportado' AND OLD.status_envio IS DISTINCT FROM 'exportado' THEN
    RETURN NEW;
  END IF;

  -- Já exportada não pode editar
  IF OLD.status_envio = 'exportado' THEN
    RAISE EXCEPTION 'atendimento_ja_exportado: este atendimento já foi enviado ao eSUS e não pode ser alterado' USING ERRCODE = 'P0040';
  END IF;

  -- Após 2h da finalização: somente leitura
  IF OLD.finalizado_em IS NOT NULL AND OLD.finalizado_em < now() - interval '2 hours' THEN
    RAISE EXCEPTION 'atendimento_prazo_expirado: prazo de 2 horas para edição expirou' USING ERRCODE = 'P0041';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_atendimentos_janela_edicao ON public.atendimentos;
CREATE TRIGGER tg_atendimentos_janela_edicao
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_atendimento_janela_edicao();

-- Trigger genérico: invalida status_envio quando ficha exportada é alterada
CREATE OR REPLACE FUNCTION public.fn_ficha_invalidar_exportacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Se a única mudança foi nos campos de envio, não invalida
  IF (NEW.status_envio IS DISTINCT FROM OLD.status_envio
      OR NEW.exportado_em IS DISTINCT FROM OLD.exportado_em
      OR NEW.exportacao_id IS DISTINCT FROM OLD.exportacao_id)
     AND to_jsonb(NEW) - 'status_envio' - 'exportado_em' - 'exportacao_id' - 'updated_at'
       = to_jsonb(OLD) - 'status_envio' - 'exportado_em' - 'exportacao_id' - 'updated_at' THEN
    RETURN NEW;
  END IF;

  IF OLD.status_envio = 'exportado' THEN
    NEW.status_envio := 'desatualizado';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_pacientes_invalidar_export ON public.pacientes;
CREATE TRIGGER tg_pacientes_invalidar_export
  BEFORE UPDATE ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_ficha_invalidar_exportacao();

DROP TRIGGER IF EXISTS tg_domicilios_invalidar_export ON public.domicilios;
CREATE TRIGGER tg_domicilios_invalidar_export
  BEFORE UPDATE ON public.domicilios
  FOR EACH ROW EXECUTE FUNCTION public.fn_ficha_invalidar_exportacao();

-- Função utilitária para marcar fichas como exportadas em lote
CREATE OR REPLACE FUNCTION public.marcar_fichas_exportadas(
  p_exportacao_id uuid,
  p_atendimentos uuid[] DEFAULT '{}',
  p_pacientes uuid[] DEFAULT '{}',
  p_domicilios uuid[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF array_length(p_atendimentos,1) > 0 THEN
    UPDATE public.atendimentos
       SET status_envio = 'exportado',
           exportado_em = now(),
           exportacao_id = p_exportacao_id
     WHERE id = ANY(p_atendimentos);
  END IF;
  IF array_length(p_pacientes,1) > 0 THEN
    UPDATE public.pacientes
       SET status_envio = 'exportado',
           exportado_em = now(),
           exportacao_id = p_exportacao_id
     WHERE id = ANY(p_pacientes);
  END IF;
  IF array_length(p_domicilios,1) > 0 THEN
    UPDATE public.domicilios
       SET status_envio = 'exportado',
           exportado_em = now(),
           exportacao_id = p_exportacao_id
     WHERE id = ANY(p_domicilios);
  END IF;
END $$;
