-- Adiciona coluna codigo (8 chars) com unicidade
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS codigo text;

-- Função para gerar código único de 8 chars (sem 0, O, I, 1 para evitar confusão)
CREATE OR REPLACE FUNCTION public.gen_agendamento_codigo()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  i int;
  exists_already boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.agendamentos WHERE codigo = result) INTO exists_already;
    IF NOT exists_already THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$;

-- Trigger para preencher codigo no INSERT
CREATE OR REPLACE FUNCTION public.fn_ag_set_codigo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := public.gen_agendamento_codigo();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_set_codigo ON public.agendamentos;
CREATE TRIGGER trg_ag_set_codigo
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_ag_set_codigo();

-- Backfill códigos existentes
UPDATE public.agendamentos
SET codigo = public.gen_agendamento_codigo()
WHERE codigo IS NULL;

-- Constraint final: NOT NULL + UNIQUE
ALTER TABLE public.agendamentos
  ALTER COLUMN codigo SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_codigo_uniq
  ON public.agendamentos(codigo);

-- RPC pública para consulta do cidadão (código + CPF)
-- Retorna apenas dados do próprio agendamento, sem expor outros pacientes
CREATE OR REPLACE FUNCTION public.cidadao_consultar(p_codigo text, p_cpf text)
RETURNS TABLE (
  codigo text,
  data date,
  hora_inicio time,
  status agendamento_status,
  is_encaixe boolean,
  paciente_nome text,
  profissional_nome text,
  profissional_conselho text,
  especialidade_nome text,
  unidade_nome text,
  unidade_endereco text,
  unidade_telefone text,
  observacoes text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_cpf text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_cod text := upper(trim(COALESCE(p_codigo, '')));
BEGIN
  IF length(v_cpf) <> 11 OR length(v_cod) <> 8 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.codigo,
    a.data,
    a.hora_inicio,
    a.status,
    a.is_encaixe,
    pa.nome,
    pr.nome,
    NULLIF(concat_ws(' ', pr.conselho, pr.conselho_numero, pr.conselho_uf), ''),
    e.nome,
    u.nome,
    u.endereco,
    u.telefone,
    a.observacoes
  FROM public.agendamentos a
  JOIN public.pacientes pa ON pa.id = a.paciente_id
  LEFT JOIN public.profissionais pr ON pr.id = a.profissional_id
  LEFT JOIN public.especialidades e ON e.id = pr.especialidade_id
  LEFT JOIN public.unidades u ON u.id = a.unidade_id
  WHERE a.codigo = v_cod
    AND pa.cpf = v_cpf
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.cidadao_consultar(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cidadao_consultar(text, text) TO anon, authenticated;