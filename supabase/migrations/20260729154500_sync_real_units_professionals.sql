-- Identificadores estáveis do sistema Fiorilli para upserts futuros.
ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS codigo_origem_firebird text;

ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS codigo_origem_firebird text;

CREATE UNIQUE INDEX IF NOT EXISTS unidades_codigo_firebird_unq
  ON public.unidades (codigo_origem_firebird);

CREATE UNIQUE INDEX IF NOT EXISTS profissionais_codigo_firebird_unq
  ON public.profissionais (codigo_origem_firebird);

-- Os cadastros anteriores eram demonstrativos. Mantê-los inativos preserva
-- referências existentes sem misturá-los aos dados reais.
UPDATE public.unidades
SET ativo = false
WHERE codigo_origem_firebird IS NULL;

UPDATE public.profissionais
SET ativo = false
WHERE codigo_origem_firebird IS NULL;

-- Para códigos que aparecem com pequenas variações de texto, utiliza o nome
-- mais frequente nos encaminhamentos (e o mais recente como desempate).
WITH ocorrencias AS (
  SELECT
    payload->>'CD_UNIDADE' AS codigo,
    payload->>'UNIDADE_NOME' AS nome,
    COUNT(*) AS quantidade,
    MAX(created_at) AS ultima_ocorrencia
  FROM public.integracao_registros
  WHERE tabela = 'ENCAMINHAMENTO'
    AND NULLIF(payload->>'CD_UNIDADE', '') IS NOT NULL
    AND NULLIF(payload->>'UNIDADE_NOME', '') IS NOT NULL
  GROUP BY 1, 2
),
escolhidas AS (
  SELECT codigo, nome
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY codigo
        ORDER BY quantidade DESC, ultima_ocorrencia DESC, nome
      ) AS ordem
    FROM ocorrencias
  ) ranked
  WHERE ordem = 1
)
INSERT INTO public.unidades (codigo_origem_firebird, nome, ativo)
SELECT codigo, nome, true
FROM escolhidas
ON CONFLICT (codigo_origem_firebird) DO UPDATE
SET nome = EXCLUDED.nome,
    ativo = true,
    updated_at = now();

-- Especialidades disponíveis no payload.
INSERT INTO public.especialidades (nome, ativo)
SELECT DISTINCT payload->>'ESPECIALIDADE_NOME', true
FROM public.integracao_registros
WHERE tabela = 'ENCAMINHAMENTO'
  AND NULLIF(payload->>'ESPECIALIDADE_NOME', '') IS NOT NULL
ON CONFLICT (nome) DO UPDATE SET ativo = true;

-- Escolhe os dados mais frequentes por código de médico e sua unidade
-- principal. As demais unidades são preservadas na tabela de vínculos abaixo.
WITH ocorrencias AS (
  SELECT
    payload->>'CD_MEDICO' AS codigo,
    payload->>'MEDICO_NOME' AS nome,
    NULLIF(payload->>'CD_CBO', '') AS cbo,
    NULLIF(payload->>'ESPECIALIDADE_NOME', '') AS especialidade,
    NULLIF(payload->>'CD_UNIDADE', '') AS codigo_unidade,
    COUNT(*) AS quantidade,
    MAX(created_at) AS ultima_ocorrencia
  FROM public.integracao_registros
  WHERE tabela = 'ENCAMINHAMENTO'
    AND NULLIF(payload->>'CD_MEDICO', '') IS NOT NULL
    AND NULLIF(payload->>'MEDICO_NOME', '') IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5
),
escolhidos AS (
  SELECT codigo, nome, cbo, especialidade, codigo_unidade
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY codigo
        ORDER BY quantidade DESC, ultima_ocorrencia DESC, nome
      ) AS ordem
    FROM ocorrencias
  ) ranked
  WHERE ordem = 1
)
INSERT INTO public.profissionais (
  codigo_origem_firebird,
  nome,
  cbo,
  especialidade_id,
  unidade_id,
  ativo
)
SELECT
  e.codigo,
  e.nome,
  e.cbo,
  esp.id,
  uni.id,
  true
FROM escolhidos e
LEFT JOIN public.especialidades esp ON esp.nome = e.especialidade
LEFT JOIN public.unidades uni ON uni.codigo_origem_firebird = e.codigo_unidade
ON CONFLICT (codigo_origem_firebird) DO UPDATE
SET nome = EXCLUDED.nome,
    cbo = COALESCE(EXCLUDED.cbo, public.profissionais.cbo),
    especialidade_id = COALESCE(EXCLUDED.especialidade_id, public.profissionais.especialidade_id),
    unidade_id = COALESCE(EXCLUDED.unidade_id, public.profissionais.unidade_id),
    ativo = true,
    updated_at = now();

-- Todos os vínculos médico–unidade observados no legado.
INSERT INTO public.profissional_unidades (profissional_id, unidade_id)
SELECT DISTINCT p.id, u.id
FROM public.integracao_registros r
JOIN public.profissionais p
  ON p.codigo_origem_firebird = NULLIF(r.payload->>'CD_MEDICO', '')
JOIN public.unidades u
  ON u.codigo_origem_firebird = NULLIF(r.payload->>'CD_UNIDADE', '')
WHERE r.tabela = 'ENCAMINHAMENTO'
ON CONFLICT (profissional_id, unidade_id) DO NOTHING;
