-- Pacientes em observação são atendimentos breves e não são internações.
-- Esta estrutura os mantém separados, preservando o vínculo clínico e a alta.
CREATE TABLE IF NOT EXISTS public.observacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_origem_firebird text NOT NULL UNIQUE,
  ficha_firebird text NOT NULL,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id),
  leito_id uuid REFERENCES public.leitos(id),
  medico_id uuid REFERENCES public.profissionais(id),
  data_entrada timestamptz,
  data_alta timestamptz,
  status text NOT NULL DEFAULT 'em_observacao'
    CHECK (status IN ('em_observacao', 'reavaliacao', 'alta')),
  flag_observacao text,
  reavaliar boolean NOT NULL DEFAULT false,
  data_reavaliacao timestamptz,
  pos_consulta text,
  convenio text,
  setor text,
  setor_cor text,
  quarto text,
  leito_descricao text,
  risco text,
  risco_cor text,
  risco_prioridade integer,
  tipo_ficha text,
  qtd_acompanhantes integer NOT NULL DEFAULT 0,
  qtd_prescricoes integer NOT NULL DEFAULT 0,
  qtd_medicacoes_pendentes integer NOT NULL DEFAULT 0,
  qtd_evolucoes integer NOT NULL DEFAULT 0,
  qtd_anotacoes integer NOT NULL DEFAULT 0,
  qtd_orientacoes integer NOT NULL DEFAULT 0,
  qtd_guias integer NOT NULL DEFAULT 0,
  qtd_receitas integer NOT NULL DEFAULT 0,
  qtd_atestados integer NOT NULL DEFAULT 0,
  qtd_procedimentos integer NOT NULL DEFAULT 0,
  qtd_questionarios integer NOT NULL DEFAULT 0,
  sincronizado_firebird boolean NOT NULL DEFAULT true,
  payload_atualizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS observacoes_unidade_status_idx
  ON public.observacoes(unidade_id, status, data_entrada DESC);
CREATE INDEX IF NOT EXISTS observacoes_paciente_idx
  ON public.observacoes(paciente_id, data_entrada DESC);

ALTER TABLE public.observacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.observacoes TO authenticated;
GRANT ALL ON public.observacoes TO service_role;

DROP POLICY IF EXISTS observacoes_select ON public.observacoes;
CREATE POLICY observacoes_select ON public.observacoes
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_permission(auth.uid(), 'leitos', 'view')
  );

DROP POLICY IF EXISTS observacoes_manage ON public.observacoes;
CREATE POLICY observacoes_manage ON public.observacoes
  FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_permission(auth.uid(), 'leitos', 'manage')
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_permission(auth.uid(), 'leitos', 'manage')
  );

DROP TRIGGER IF EXISTS trg_observacoes_updated ON public.observacoes;
CREATE TRIGGER trg_observacoes_updated
  BEFORE UPDATE ON public.observacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.materializar_integracao_observacao(p_lote_id uuid)
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
  v_medico uuid;
  v_leito uuid;
  v_entrada timestamptz;
  v_alta timestamptz;
  v_reavaliacao timestamptz;
  v_codigo text;
  v_total integer := 0;
BEGIN
  FOR r IN
    SELECT payload
    FROM public.integracao_registros
    WHERE lote_id = p_lote_id
      AND tabela = 'OBSERVACAO'
  LOOP
    p := r.payload;
    v_codigo := NULLIF(p->>'CD_UNIDADE', '') || '|' || NULLIF(p->>'NFICHA', '');
    IF v_codigo IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_unidade
    FROM public.unidades
    WHERE codigo_origem_firebird = NULLIF(p->>'CD_UNIDADE', '')
    LIMIT 1;
    IF v_unidade IS NULL THEN
      INSERT INTO public.unidades(codigo_origem_firebird, nome, ativo)
      VALUES (
        p->>'CD_UNIDADE',
        COALESCE(NULLIF(p->>'UNIDADE_NOME', ''), 'Unidade ' || (p->>'CD_UNIDADE')),
        true
      )
      ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
        nome = COALESCE(NULLIF(EXCLUDED.nome, ''), public.unidades.nome),
        ativo = true
      RETURNING id INTO v_unidade;
    END IF;

    SELECT id INTO v_paciente
    FROM public.pacientes
    WHERE codigo_origem_firebird = NULLIF(p->>'NMATRICULA', '')
    LIMIT 1;
    IF v_paciente IS NULL AND NULLIF(p->>'PACIENTE_CPF', '') IS NOT NULL THEN
      SELECT id INTO v_paciente FROM public.pacientes
      WHERE cpf = NULLIF(regexp_replace(p->>'PACIENTE_CPF', '\D', '', 'g'), '')
      LIMIT 1;
    END IF;
    IF v_paciente IS NULL AND NULLIF(p->>'PACIENTE_CNS', '') IS NOT NULL THEN
      SELECT id INTO v_paciente FROM public.pacientes
      WHERE cns = NULLIF(regexp_replace(p->>'PACIENTE_CNS', '\D', '', 'g'), '')
      LIMIT 1;
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
        CASE WHEN upper(p->>'PACIENTE_SEXO') IN ('M', 'F', 'O')
          THEN upper(p->>'PACIENTE_SEXO')::public.sexo_tipo ELSE NULL END,
        NULLIF(p->>'PACIENTE_MAE', ''),
        NULLIF(p->>'PACIENTE_TELEFONE', ''),
        true
      )
      RETURNING id INTO v_paciente;
    ELSE
      UPDATE public.pacientes SET
        codigo_origem_firebird = COALESCE(codigo_origem_firebird, p->>'NMATRICULA'),
        nome = COALESCE(NULLIF(p->>'PACIENTE_NOME', ''), nome),
        ativo = true
      WHERE id = v_paciente;
    END IF;

    v_medico := public.upsert_profissional_firebird(
      NULLIF(p->>'CD_MEDICO', ''),
      NULLIF(p->>'MEDICO_NOME', ''),
      v_unidade
    );
    SELECT id INTO v_leito
    FROM public.leitos
    WHERE codigo_origem_firebird = NULLIF(p->>'CD_LEITO', '')
    LIMIT 1;

    v_entrada := CASE WHEN NULLIF(p->>'DATA', '') IS NULL THEN NULL
      ELSE ((left(p->>'DATA', 10)::date +
        COALESCE(NULLIF(left(p->>'HORA', 8), '')::time, time '00:00'))
        AT TIME ZONE 'America/Sao_Paulo') END;
    v_alta := CASE WHEN NULLIF(p->>'DT_ALTA', '') IS NULL THEN NULL
      ELSE ((left(p->>'DT_ALTA', 10)::date +
        COALESCE(NULLIF(left(p->>'HR_ALTA', 8), '')::time, time '00:00'))
        AT TIME ZONE 'America/Sao_Paulo') END;
    v_reavaliacao := CASE WHEN NULLIF(p->>'DT_REAVALIAR', '') IS NULL THEN NULL
      ELSE (left(p->>'DT_REAVALIAR', 19)::timestamp AT TIME ZONE 'America/Sao_Paulo') END;

    INSERT INTO public.observacoes(
      codigo_origem_firebird, ficha_firebird, paciente_id, unidade_id,
      leito_id, medico_id, data_entrada, data_alta, status,
      flag_observacao, reavaliar, data_reavaliacao, pos_consulta,
      convenio, setor, setor_cor, quarto, leito_descricao,
      risco, risco_cor, risco_prioridade, tipo_ficha,
      qtd_acompanhantes, qtd_prescricoes, qtd_medicacoes_pendentes,
      qtd_evolucoes, qtd_anotacoes, qtd_orientacoes, qtd_guias,
      qtd_receitas, qtd_atestados, qtd_procedimentos, qtd_questionarios,
      sincronizado_firebird, payload_atualizado_em
    ) VALUES (
      v_codigo, p->>'NFICHA', v_paciente, v_unidade,
      v_leito, v_medico, v_entrada, v_alta,
      CASE
        WHEN upper(COALESCE(p->>'OBSERVACAO_ATIVA', 'N')) <> 'S' THEN 'alta'
        WHEN upper(COALESCE(p->>'FLG_REAVALIAR', 'N')) = 'S'
          OR upper(COALESCE(p->>'FLG_OBSERVACAO', '')) = 'R' THEN 'reavaliacao'
        ELSE 'em_observacao'
      END,
      NULLIF(p->>'FLG_OBSERVACAO', ''),
      upper(COALESCE(p->>'FLG_REAVALIAR', 'N')) = 'S',
      v_reavaliacao, NULLIF(p->>'POSCONSULTA', ''),
      NULLIF(p->>'CONVENIO_NOME', ''), NULLIF(p->>'DE_SETOR', ''),
      NULLIF(p->>'SETOR_COR_GRID', ''), NULLIF(p->>'DE_QUARTO', ''),
      NULLIF(p->>'DE_LEITO', ''), NULLIF(p->>'DE_RISCO', ''),
      NULLIF(p->>'RISCO_COR', ''), COALESCE(NULLIF(p->>'RISCO_PRIORIDADE', '')::integer, 99),
      NULLIF(p->>'DE_TIPOFICHA_GRUPO', ''),
      COALESCE(NULLIF(p->>'QTD_ACOM', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_PRES', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_AGE', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_EVO', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_ANOT', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_ORI', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_GUIA', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_REC', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_ATE', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_EXT', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_QST', '')::integer, 0),
      true, now()
    )
    ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
      ficha_firebird = EXCLUDED.ficha_firebird,
      paciente_id = EXCLUDED.paciente_id,
      unidade_id = EXCLUDED.unidade_id,
      leito_id = EXCLUDED.leito_id,
      medico_id = EXCLUDED.medico_id,
      data_entrada = EXCLUDED.data_entrada,
      data_alta = EXCLUDED.data_alta,
      status = EXCLUDED.status,
      flag_observacao = EXCLUDED.flag_observacao,
      reavaliar = EXCLUDED.reavaliar,
      data_reavaliacao = EXCLUDED.data_reavaliacao,
      pos_consulta = EXCLUDED.pos_consulta,
      convenio = EXCLUDED.convenio,
      setor = EXCLUDED.setor,
      setor_cor = EXCLUDED.setor_cor,
      quarto = EXCLUDED.quarto,
      leito_descricao = EXCLUDED.leito_descricao,
      risco = EXCLUDED.risco,
      risco_cor = EXCLUDED.risco_cor,
      risco_prioridade = EXCLUDED.risco_prioridade,
      tipo_ficha = EXCLUDED.tipo_ficha,
      qtd_acompanhantes = EXCLUDED.qtd_acompanhantes,
      qtd_prescricoes = EXCLUDED.qtd_prescricoes,
      qtd_medicacoes_pendentes = EXCLUDED.qtd_medicacoes_pendentes,
      qtd_evolucoes = EXCLUDED.qtd_evolucoes,
      qtd_anotacoes = EXCLUDED.qtd_anotacoes,
      qtd_orientacoes = EXCLUDED.qtd_orientacoes,
      qtd_guias = EXCLUDED.qtd_guias,
      qtd_receitas = EXCLUDED.qtd_receitas,
      qtd_atestados = EXCLUDED.qtd_atestados,
      qtd_procedimentos = EXCLUDED.qtd_procedimentos,
      qtd_questionarios = EXCLUDED.qtd_questionarios,
      sincronizado_firebird = true,
      payload_atualizado_em = now();
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;

ALTER FUNCTION public.materializar_integracao_observacao(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.materializar_integracao_observacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materializar_integracao_observacao(uuid) TO service_role;
