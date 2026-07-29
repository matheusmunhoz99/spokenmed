-- Integração idempotente do módulo hospitalar Fiorilli/Firebird.
ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS codigo_origem_firebird text;
ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS codigo_origem_firebird text;
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS codigo_origem_firebird text;
ALTER TABLE public.leitos
  ADD COLUMN IF NOT EXISTS codigo_origem_firebird text;
ALTER TABLE public.internacoes
  ADD COLUMN IF NOT EXISTS codigo_origem_firebird text,
  ADD COLUMN IF NOT EXISTS codigo_internacao_firebird text,
  ADD COLUMN IF NOT EXISTS medico_responsavel_id uuid REFERENCES public.profissionais(id),
  ADD COLUMN IF NOT EXISTS medico_solicitante_id uuid REFERENCES public.profissionais(id),
  ADD COLUMN IF NOT EXISTS medico_alta_id uuid REFERENCES public.profissionais(id),
  ADD COLUMN IF NOT EXISTS status_origem text,
  ADD COLUMN IF NOT EXISTS sincronizado_firebird boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS unidades_codigo_firebird_unq
  ON public.unidades(codigo_origem_firebird);
CREATE UNIQUE INDEX IF NOT EXISTS profissionais_codigo_firebird_unq
  ON public.profissionais(codigo_origem_firebird);
CREATE UNIQUE INDEX IF NOT EXISTS pacientes_codigo_firebird_unq
  ON public.pacientes(codigo_origem_firebird);
CREATE UNIQUE INDEX IF NOT EXISTS leitos_codigo_firebird_unq
  ON public.leitos(codigo_origem_firebird);
CREATE UNIQUE INDEX IF NOT EXISTS internacoes_codigo_firebird_unq
  ON public.internacoes(codigo_origem_firebird);

CREATE TABLE IF NOT EXISTS public.internacao_evolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internacao_id uuid NOT NULL REFERENCES public.internacoes(id) ON DELETE CASCADE,
  codigo_origem_firebird text NOT NULL UNIQUE,
  profissional_id uuid REFERENCES public.profissionais(id),
  data_hora timestamptz,
  evolucao text,
  prescricao text,
  situacao text,
  pressao_sistolica numeric,
  pressao_diastolica numeric,
  glicemia numeric,
  bpm numeric,
  temperatura numeric,
  rpm numeric,
  saturacao numeric,
  fracao_o2 numeric,
  peso numeric,
  anotacao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.internacao_evolucoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internacao_evolucoes TO authenticated;
GRANT ALL ON public.internacao_evolucoes TO service_role;
DROP POLICY IF EXISTS internacao_evolucoes_select ON public.internacao_evolucoes;
CREATE POLICY internacao_evolucoes_select ON public.internacao_evolucoes
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_permission(auth.uid(), 'leitos', 'view')
  );
DROP TRIGGER IF EXISTS trg_internacao_evolucoes_updated ON public.internacao_evolucoes;
CREATE TRIGGER trg_internacao_evolucoes_updated
  BEFORE UPDATE ON public.internacao_evolucoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_profissional_firebird(
  p_codigo text, p_nome text, p_unidade uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_codigo IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.profissionais(
    codigo_origem_firebird, nome, unidade_id, ativo
  ) VALUES (
    p_codigo, COALESCE(p_nome, 'Profissional ' || p_codigo), p_unidade, true
  )
  ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
    nome = COALESCE(p_nome, public.profissionais.nome),
    unidade_id = COALESCE(p_unidade, public.profissionais.unidade_id),
    ativo = true
  RETURNING id INTO v_id;
  IF p_unidade IS NOT NULL THEN
    INSERT INTO public.profissional_unidades(profissional_id, unidade_id)
    VALUES (v_id, p_unidade) ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.materializar_integracao_hospitalar(p_lote_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  p jsonb;
  v_unidade uuid;
  v_paciente uuid;
  v_med_resp uuid;
  v_med_solic uuid;
  v_med_alta uuid;
  v_medico uuid;
  v_leito uuid;
  v_internacao uuid;
  v_data_admissao timestamptz;
  v_data_alta timestamptz;
  v_data_evolucao timestamptz;
  v_total integer := 0;
  v_ativo boolean;
BEGIN
  FOR r IN
    SELECT tabela, payload
    FROM public.integracao_registros
    WHERE lote_id = p_lote_id
      AND tabela IN ('LEITO', 'INTERNACAO', 'INTER_EVOLUCAO')
    ORDER BY CASE tabela WHEN 'LEITO' THEN 1 WHEN 'INTERNACAO' THEN 2 ELSE 3 END
  LOOP
    p := r.payload;

    IF r.tabela IN ('LEITO', 'INTERNACAO') THEN
      v_unidade := NULL;
      SELECT id INTO v_unidade FROM public.unidades
       WHERE codigo_origem_firebird = NULLIF(p->>'CD_UNIDADE', '') LIMIT 1;
      IF v_unidade IS NULL AND NULLIF(p->>'CD_UNIDADE', '') IS NOT NULL THEN
        INSERT INTO public.unidades(codigo_origem_firebird, nome, ativo)
        VALUES (
          p->>'CD_UNIDADE',
          COALESCE(NULLIF(p->>'UNIDADE_NOME', ''), 'Unidade ' || (p->>'CD_UNIDADE')),
          true
        )
        ON CONFLICT (codigo_origem_firebird) DO UPDATE
          SET nome = COALESCE(NULLIF(EXCLUDED.nome, ''), public.unidades.nome),
              ativo = true
        RETURNING id INTO v_unidade;
      END IF;
    END IF;

    IF r.tabela = 'LEITO' THEN
      IF v_unidade IS NULL THEN CONTINUE; END IF;
      v_ativo := COALESCE(upper(p->>'FLG_ATIVO') <> 'N', true);
      v_leito := NULL;
      SELECT id INTO v_leito FROM public.leitos
       WHERE codigo_origem_firebird = NULLIF(p->>'CD_LEITO', '') LIMIT 1;
      IF v_leito IS NULL THEN
        SELECT id INTO v_leito FROM public.leitos
         WHERE unidade_id = v_unidade
           AND quarto = COALESCE(NULLIF(p->>'CD_QUARTO', ''), 'SEM QUARTO')
           AND numero = COALESCE(NULLIF(p->>'DE_LEITO', ''), p->>'CD_LEITO')
         LIMIT 1;
      END IF;
      IF v_leito IS NULL THEN
        INSERT INTO public.leitos(
          unidade_id, codigo_origem_firebird, ala, quarto, numero,
          tipo, situacao, observacoes, ativo
        ) VALUES (
          v_unidade, p->>'CD_LEITO', NULLIF(p->>'DE_QUARTO', ''),
          COALESCE(NULLIF(p->>'CD_QUARTO', ''), 'SEM QUARTO'),
          COALESCE(NULLIF(p->>'DE_LEITO', ''), p->>'CD_LEITO'), 'clinico',
          CASE
            WHEN upper(COALESCE(p->>'LEITO_SITUACAO', '')) LIKE '%OCUP%' THEN 'ocupado'::public.leito_situacao
            WHEN upper(COALESCE(p->>'LEITO_SITUACAO', '')) LIKE '%HIGIEN%' THEN 'higienizacao'::public.leito_situacao
            WHEN upper(COALESCE(p->>'LEITO_SITUACAO', '')) LIKE '%MANUT%' THEN 'manutencao'::public.leito_situacao
            WHEN upper(COALESCE(p->>'LEITO_SITUACAO', '')) LIKE '%BLOQ%' THEN 'bloqueado'::public.leito_situacao
            ELSE 'livre'::public.leito_situacao
          END,
          NULLIF(p->>'LEITO_SITUACAO', ''), v_ativo
        );
      ELSE
        UPDATE public.leitos SET
          unidade_id = v_unidade,
          codigo_origem_firebird = p->>'CD_LEITO',
          ala = NULLIF(p->>'DE_QUARTO', ''),
          quarto = COALESCE(NULLIF(p->>'CD_QUARTO', ''), 'SEM QUARTO'),
          numero = COALESCE(NULLIF(p->>'DE_LEITO', ''), p->>'CD_LEITO'),
          situacao = CASE
          WHEN upper(COALESCE(p->>'LEITO_SITUACAO', '')) LIKE '%OCUP%' THEN 'ocupado'::public.leito_situacao
          WHEN upper(COALESCE(p->>'LEITO_SITUACAO', '')) LIKE '%HIGIEN%' THEN 'higienizacao'::public.leito_situacao
          WHEN upper(COALESCE(p->>'LEITO_SITUACAO', '')) LIKE '%MANUT%' THEN 'manutencao'::public.leito_situacao
          WHEN upper(COALESCE(p->>'LEITO_SITUACAO', '')) LIKE '%BLOQ%' THEN 'bloqueado'::public.leito_situacao
          ELSE 'livre'::public.leito_situacao
          END,
          observacoes = NULLIF(p->>'LEITO_SITUACAO', ''),
          ativo = v_ativo
        WHERE id = v_leito;
      END IF;
      v_total := v_total + 1;
      CONTINUE;
    END IF;

    IF r.tabela = 'INTERNACAO' THEN
      v_paciente := NULL;
      SELECT id INTO v_paciente FROM public.pacientes
       WHERE codigo_origem_firebird = NULLIF(p->>'NMATRICULA', '') LIMIT 1;
      IF v_paciente IS NULL AND NULLIF(p->>'PACIENTE_CPF', '') IS NOT NULL THEN
        SELECT id INTO v_paciente FROM public.pacientes
         WHERE cpf = NULLIF(regexp_replace(p->>'PACIENTE_CPF', '\D', '', 'g'), '') LIMIT 1;
      END IF;
      IF v_paciente IS NULL AND NULLIF(p->>'PACIENTE_CNS', '') IS NOT NULL THEN
        SELECT id INTO v_paciente FROM public.pacientes
         WHERE cns = NULLIF(regexp_replace(p->>'PACIENTE_CNS', '\D', '', 'g'), '') LIMIT 1;
      END IF;
      IF v_paciente IS NULL THEN
        INSERT INTO public.pacientes(
          codigo_origem_firebird, nome, cpf, cns, rg, data_nascimento,
          sexo, nome_mae, telefone, ativo
        ) VALUES (
          p->>'NMATRICULA',
          COALESCE(NULLIF(p->>'PACIENTE_NOME', ''), 'Paciente ' || (p->>'NMATRICULA')),
          NULLIF(regexp_replace(p->>'PACIENTE_CPF', '\D', '', 'g'), ''),
          NULLIF(regexp_replace(p->>'PACIENTE_CNS', '\D', '', 'g'), ''),
          NULLIF(p->>'PACIENTE_RG', ''),
          NULLIF(left(p->>'PACIENTE_DATANASCIMENTO', 10), '')::date,
          CASE WHEN upper(p->>'PACIENTE_SEXO') IN ('M','F','O')
            THEN upper(p->>'PACIENTE_SEXO')::public.sexo_tipo ELSE NULL END,
          NULLIF(p->>'PACIENTE_MAE', ''),
          NULLIF(p->>'PACIENTE_TELEFONE', ''),
          true
        ) RETURNING id INTO v_paciente;
      ELSE
        UPDATE public.pacientes SET
          codigo_origem_firebird = COALESCE(codigo_origem_firebird, p->>'NMATRICULA'),
          nome = COALESCE(NULLIF(p->>'PACIENTE_NOME', ''), nome),
          ativo = true
        WHERE id = v_paciente;
      END IF;

      v_med_resp := public.upsert_profissional_firebird(
        NULLIF(p->>'CD_MEDICO_RESPONSAVEL', ''),
        NULLIF(p->>'MEDICO_RESPONSAVEL_NOME', ''),
        v_unidade
      );
      v_med_solic := public.upsert_profissional_firebird(
        NULLIF(p->>'CD_MEDICO_SOLIC', ''),
        NULLIF(p->>'MEDICO_SOLICITANTE_NOME', ''),
        v_unidade
      );
      v_med_alta := public.upsert_profissional_firebird(
        NULLIF(p->>'CD_MEDICO_ALTA', ''),
        NULLIF(p->>'MEDICO_ALTA_NOME', ''),
        v_unidade
      );
      SELECT id INTO v_leito FROM public.leitos
       WHERE codigo_origem_firebird = NULLIF(p->>'CD_LEITO', '') LIMIT 1;

      v_data_admissao := CASE WHEN NULLIF(p->>'DT_INTERNA', '') IS NULL THEN NULL
        ELSE ((left(p->>'DT_INTERNA', 10)::date +
          COALESCE(NULLIF(left(p->>'HR_INTERNA', 8), '')::time, time '00:00'))
          AT TIME ZONE 'America/Sao_Paulo') END;
      v_data_alta := CASE WHEN NULLIF(p->>'DT_SAIDA', '') IS NULL THEN NULL
        ELSE ((left(p->>'DT_SAIDA', 10)::date +
          COALESCE(NULLIF(left(p->>'HR_SAIDA', 8), '')::time, time '00:00'))
          AT TIME ZONE 'America/Sao_Paulo') END;

      INSERT INTO public.internacoes(
        codigo_origem_firebird, codigo_internacao_firebird,
        paciente_id, unidade_id, leito_id, motivo, cid10, status,
        data_admissao, data_alta, observacoes, medico_responsavel_id,
        medico_solicitante_id, medico_alta_id, status_origem,
        sincronizado_firebird
      ) VALUES (
        p->>'ID_INTERNACAO', NULLIF(p->>'CD_INTERNACAO', ''),
        v_paciente, v_unidade, v_leito,
        COALESCE(NULLIF(p->>'JUSTIF_INTERNA', ''), NULLIF(p->>'SINTOMAS', ''), 'Internação'),
        NULLIF(p->>'CD_CID_PRINC', ''),
        CASE
          WHEN v_data_alta IS NOT NULL THEN 'alta'::public.internacao_status
          WHEN NULLIF(p->>'LEITO_NMATRICULA', '') = NULLIF(p->>'NMATRICULA', '')
            THEN 'aprovada'::public.internacao_status
          ELSE 'alta'::public.internacao_status
        END,
        v_data_admissao, v_data_alta,
        COALESCE(NULLIF(p->>'OBSER', ''), NULLIF(p->>'PROVAS_DIAG', '')),
        v_med_resp, v_med_solic, v_med_alta,
        NULLIF(p->>'STATUS_DESCRICAO', ''), true
      )
      ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
        paciente_id = EXCLUDED.paciente_id,
        unidade_id = EXCLUDED.unidade_id,
        leito_id = EXCLUDED.leito_id,
        motivo = EXCLUDED.motivo,
        cid10 = EXCLUDED.cid10,
        status = EXCLUDED.status,
        data_admissao = EXCLUDED.data_admissao,
        data_alta = EXCLUDED.data_alta,
        observacoes = EXCLUDED.observacoes,
        medico_responsavel_id = EXCLUDED.medico_responsavel_id,
        medico_solicitante_id = EXCLUDED.medico_solicitante_id,
        medico_alta_id = EXCLUDED.medico_alta_id,
        status_origem = EXCLUDED.status_origem,
        sincronizado_firebird = true;
      v_total := v_total + 1;
      CONTINUE;
    END IF;

    IF r.tabela = 'INTER_EVOLUCAO' THEN
      SELECT id, unidade_id INTO v_internacao, v_unidade
      FROM public.internacoes
      WHERE codigo_origem_firebird = NULLIF(p->>'ID_INTERNACAO', '') LIMIT 1;
      IF v_internacao IS NULL THEN CONTINUE; END IF;
      v_medico := public.upsert_profissional_firebird(
        NULLIF(p->>'CD_MEDICO', ''), NULLIF(p->>'MEDICO_NOME', ''), v_unidade);
      v_data_evolucao := CASE WHEN NULLIF(p->>'DT_EVOLUCAO', '') IS NULL THEN NULL
        ELSE ((left(p->>'DT_EVOLUCAO', 10)::date +
          COALESCE(NULLIF(left(p->>'HR_EVOLUCAO', 8), '')::time, time '00:00'))
          AT TIME ZONE 'America/Sao_Paulo') END;
      INSERT INTO public.internacao_evolucoes(
        internacao_id, codigo_origem_firebird, profissional_id, data_hora,
        evolucao, prescricao, situacao, pressao_sistolica, pressao_diastolica,
        glicemia, bpm, temperatura, rpm, saturacao, fracao_o2, peso, anotacao
      ) VALUES (
        v_internacao, (p->>'ID_INTERNACAO') || '|' || (p->>'ID_ITEM'),
        v_medico, v_data_evolucao, NULLIF(p->>'EVOLUCAO', ''),
        NULLIF(p->>'PRESCRICAO', ''),
        COALESCE(NULLIF(p->>'SITUACAO_DESCRICAO', ''), NULLIF(p->>'SITUACAO', '')),
        NULLIF(p->>'PRESSAO1', '')::numeric, NULLIF(p->>'PRESSAO2', '')::numeric,
        NULLIF(p->>'GLICEMIA_CAPILAR', '')::numeric, NULLIF(p->>'BPM', '')::numeric,
        NULLIF(p->>'TEMPERATURA', '')::numeric, NULLIF(p->>'RPM', '')::numeric,
        NULLIF(p->>'SATURACAO', '')::numeric, NULLIF(p->>'FRACAO_O2', '')::numeric,
        NULLIF(p->>'PESO', '')::numeric, upper(COALESCE(p->>'FLG_ANOTACAO', 'N')) = 'S'
      )
      ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
        profissional_id = EXCLUDED.profissional_id,
        data_hora = EXCLUDED.data_hora,
        evolucao = EXCLUDED.evolucao,
        prescricao = EXCLUDED.prescricao,
        situacao = EXCLUDED.situacao,
        pressao_sistolica = EXCLUDED.pressao_sistolica,
        pressao_diastolica = EXCLUDED.pressao_diastolica,
        glicemia = EXCLUDED.glicemia,
        bpm = EXCLUDED.bpm,
        temperatura = EXCLUDED.temperatura,
        rpm = EXCLUDED.rpm,
        saturacao = EXCLUDED.saturacao,
        fracao_o2 = EXCLUDED.fracao_o2,
        peso = EXCLUDED.peso,
        anotacao = EXCLUDED.anotacao;
      v_total := v_total + 1;
    END IF;
  END LOOP;
  RETURN v_total;
END;
$$;

ALTER FUNCTION public.materializar_integracao_hospitalar(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.materializar_integracao_hospitalar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materializar_integracao_hospitalar(uuid) TO service_role;
