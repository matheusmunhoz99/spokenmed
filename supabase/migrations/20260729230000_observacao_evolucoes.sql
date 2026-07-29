-- Tabela para armazenar as evoluções e anotações dos pacientes em observação
CREATE TABLE IF NOT EXISTS public.observacao_evolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observacao_id uuid NOT NULL REFERENCES public.observacoes(id) ON DELETE CASCADE,
  codigo_origem_firebird text NOT NULL UNIQUE,
  profissional_id uuid REFERENCES public.profissionais(id),
  profissional_nome text,
  especialidade text,
  data_hora timestamptz,
  evolucao text,
  flg_anotacao text,
  anotacao boolean NOT NULL DEFAULT false,
  pressao_sistolica numeric,
  pressao_diastolica numeric,
  bpm numeric,
  temperatura numeric,
  saturacao numeric,
  situacao text,
  usuario text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Garantir adição das colunas de sinais vitais caso a tabela já exista
ALTER TABLE public.observacao_evolucoes
  ADD COLUMN IF NOT EXISTS pressao_sistolica numeric,
  ADD COLUMN IF NOT EXISTS pressao_diastolica numeric,
  ADD COLUMN IF NOT EXISTS bpm numeric,
  ADD COLUMN IF NOT EXISTS temperatura numeric,
  ADD COLUMN IF NOT EXISTS saturacao numeric,
  ADD COLUMN IF NOT EXISTS especialidade text,
  ADD COLUMN IF NOT EXISTS situacao text;

CREATE INDEX IF NOT EXISTS observacao_evolucoes_obs_idx
  ON public.observacao_evolucoes(observacao_id, data_hora DESC);

ALTER TABLE public.observacao_evolucoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.observacao_evolucoes TO authenticated;
GRANT ALL ON public.observacao_evolucoes TO service_role;

DROP POLICY IF EXISTS observacao_evolucoes_select ON public.observacao_evolucoes;
CREATE POLICY observacao_evolucoes_select ON public.observacao_evolucoes
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_permission(auth.uid(), 'leitos', 'view')
  );

DROP POLICY IF EXISTS observacao_evolucoes_manage ON public.observacao_evolucoes;
CREATE POLICY observacao_evolucoes_manage ON public.observacao_evolucoes
  FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_permission(auth.uid(), 'leitos', 'manage')
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_permission(auth.uid(), 'leitos', 'manage')
  );

-- Atualização da função de materialização de observação para incluir FICHAATENDIMENTO_EVOLUCAO com sinais vitais e chave única por item
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
  v_obs_id uuid;
  v_prof_id uuid;
  v_entrada timestamptz;
  v_alta timestamptz;
  v_reavaliacao timestamptz;
  v_dt_evo timestamptz;
  v_codigo text;
  v_item text;
  v_total integer := 0;
BEGIN
  -- Processar registros principais de OBSERVACAO
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
      WHERE cpf = regexp_replace(p->>'PACIENTE_CPF', '\D', '', 'g') LIMIT 1;
    END IF;

    IF v_paciente IS NULL THEN
      INSERT INTO public.pacientes (
        codigo_origem_firebird, nome, cpf, cns, data_nascimento, ativo
      ) VALUES (
        NULLIF(p->>'NMATRICULA', ''),
        COALESCE(NULLIF(p->>'PACIENTE_NOME', ''), 'Paciente Ficha ' || (p->>'NFICHA')),
        NULLIF(regexp_replace(COALESCE(p->>'PACIENTE_CPF', ''), '\D', '', 'g'), ''),
        NULLIF(p->>'PACIENTE_CNS', ''),
        CASE WHEN NULLIF(p->>'PACIENTE_DTNASC', '') IS NOT NULL
          THEN left(p->>'PACIENTE_DTNASC', 10)::date ELSE NULL END,
        true
      )
      ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
        nome = COALESCE(NULLIF(EXCLUDED.nome, ''), public.pacientes.nome),
        cpf = COALESCE(EXCLUDED.cpf, public.pacientes.cpf)
      RETURNING id INTO v_paciente;
    END IF;

    v_medico := public.upsert_profissional_firebird(
      NULLIF(p->>'CD_MEDICO', ''),
      NULLIF(p->>'MEDICO_NOME', ''),
      NULL
    );

    v_leito := NULL;
    IF NULLIF(p->>'LEITO_DESCRICAO', '') IS NOT NULL OR NULLIF(p->>'QUARTO', '') IS NOT NULL THEN
      SELECT id INTO v_leito
      FROM public.leitos
      WHERE unidade_id = v_unidade
        AND quarto = COALESCE(NULLIF(p->>'QUARTO', ''), 'OBS')
        AND numero = COALESCE(NULLIF(p->>'LEITO_DESCRICAO', ''), '1')
      LIMIT 1;

      IF v_leito IS NULL THEN
        INSERT INTO public.leitos (
          unidade_id, ala, quarto, numero, tipo, situacao, observacoes
        ) VALUES (
          v_unidade,
          COALESCE(NULLIF(p->>'SETOR', ''), 'Observação'),
          COALESCE(NULLIF(p->>'QUARTO', ''), 'OBS'),
          COALESCE(NULLIF(p->>'LEITO_DESCRICAO', ''), '1'),
          'observacao',
          'ocupado',
          'Importado do Firebird'
        )
        ON CONFLICT (unidade_id, quarto, numero) DO UPDATE SET
          situacao = 'ocupado'
        RETURNING id INTO v_leito;
      END IF;
    END IF;

    v_entrada := CASE WHEN NULLIF(p->>'DATA_ENTRADA', '') IS NULL THEN now()
      ELSE ((left(p->>'DATA_ENTRADA', 10)::date +
        COALESCE(NULLIF(left(p->>'HORA_ENTRADA', 8), '')::time, time '00:00'))
        AT TIME ZONE 'America/Sao_Paulo') END;

    v_alta := CASE WHEN NULLIF(p->>'DATA_ALTA', '') IS NULL THEN NULL
      ELSE ((left(p->>'DATA_ALTA', 10)::date +
        COALESCE(NULLIF(left(p->>'HORA_ALTA', 8), '')::time, time '00:00'))
        AT TIME ZONE 'America/Sao_Paulo') END;

    v_reavaliacao := CASE WHEN NULLIF(p->>'DATA_REAVALIACAO', '') IS NULL THEN NULL
      ELSE ((left(p->>'DATA_REAVALIACAO', 10)::date +
        COALESCE(NULLIF(left(p->>'HORA_REAVALIACAO', 8), '')::time, time '00:00'))
        AT TIME ZONE 'America/Sao_Paulo') END;

    INSERT INTO public.observacoes (
      codigo_origem_firebird, ficha_firebird, unidade_id, paciente_id, leito_id,
      medico_id, data_entrada, data_alta, status, flag_observacao, reavaliar,
      data_reavaliacao, pos_consulta, convenio, setor, setor_cor, quarto,
      leito_descricao, risco, risco_cor, risco_prioridade, tipo_ficha,
      qtd_acompanhantes, qtd_prescricoes, qtd_medicacoes_pendentes, qtd_evolucoes,
      qtd_anotacoes, qtd_orientacoes, qtd_guias, qtd_receitas, qtd_atestados,
      qtd_procedimentos, qtd_questionarios, sincronizado_firebird, payload_atualizado_em
    ) VALUES (
      v_codigo, p->>'NFICHA', v_unidade, v_paciente, v_leito, v_medico,
      v_entrada, v_alta,
      CASE WHEN v_alta IS NOT NULL THEN 'alta'
           WHEN upper(COALESCE(p->>'REAVALIAR', 'N')) = 'S' THEN 'reavaliacao'
           ELSE 'em_observacao' END,
      p->>'FLG_OBSERVACAO',
      upper(COALESCE(p->>'REAVALIAR', 'N')) = 'S',
      v_reavaliacao, p->>'POS_CONSULTA', p->>'CONVENIO', p->>'SETOR',
      p->>'SETOR_COR', p->>'QUARTO', p->>'LEITO_DESCRICAO', p->>'RISCO',
      p->>'RISCO_COR', NULLIF(p->>'RISCO_PRIORIDADE', '')::integer, p->>'TIPO_FICHA',
      COALESCE(NULLIF(p->>'QTD_ACOMPANHANTES', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_PRESCRICOES', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_MEDICACOES_PENDENTES', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_EVOLUCOES', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_ANOTACOES', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_ORIENTACOES', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_GUIAS', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_RECEITAS', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_ATESTADOS', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_PROCEDIMENTOS', '')::integer, 0),
      COALESCE(NULLIF(p->>'QTD_QUESTIONARIOS', '')::integer, 0),
      true, now()
    )
    ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
      paciente_id = EXCLUDED.paciente_id,
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

  -- Processar evoluções/anotações (FICHAATENDIMENTO_EVOLUCAO)
  FOR r IN
    SELECT payload
    FROM public.integracao_registros
    WHERE lote_id = p_lote_id
      AND tabela = 'FICHAATENDIMENTO_EVOLUCAO'
  LOOP
    p := r.payload;

    -- Gerar identificador único item por item
    v_item := COALESCE(
      NULLIF(p->>'CD_ITEM', ''),
      NULLIF(p->>'ID_ITEM', ''),
      NULLIF(p->>'ITEM', ''),
      NULLIF(p->>'SEQUE', ''),
      NULLIF(p->>'ID_EVOLUCAO', ''),
      NULLIF(p->>'CD_EVOLUCAO', ''),
      regexp_replace(COALESCE(p->>'DATA', ''), '\D', '', 'g') || '_' || regexp_replace(COALESCE(p->>'HORA', ''), '\D', '', 'g'),
      '1'
    );

    v_codigo := NULLIF(p->>'CD_UNIDADE', '') || '|' || NULLIF(p->>'NFICHA', '') || '|' || v_item;
    IF v_codigo IS NULL THEN CONTINUE; END IF;

    -- Localizar a observação mãe
    SELECT id INTO v_obs_id
    FROM public.observacoes
    WHERE codigo_origem_firebird = NULLIF(p->>'CD_UNIDADE', '') || '|' || NULLIF(p->>'NFICHA', '')
    LIMIT 1;

    IF v_obs_id IS NULL THEN CONTINUE; END IF;

    -- Profissional autor da evolução
    v_prof_id := public.upsert_profissional_firebird(
      NULLIF(p->>'CD_MEDICO', ''),
      NULLIF(p->>'MEDICO_NOME', ''),
      NULL
    );

    v_dt_evo := CASE WHEN NULLIF(p->>'DATA', '') IS NULL THEN now()
      ELSE ((left(p->>'DATA', 10)::date +
        COALESCE(NULLIF(left(p->>'HORA', 8), '')::time, time '00:00'))
        AT TIME ZONE 'America/Sao_Paulo') END;

    INSERT INTO public.observacao_evolucoes (
      observacao_id, codigo_origem_firebird, profissional_id, profissional_nome, especialidade,
      data_hora, evolucao, flg_anotacao, anotacao, pressao_sistolica, pressao_diastolica,
      bpm, temperatura, saturacao, situacao, usuario
    ) VALUES (
      v_obs_id, v_codigo, v_prof_id,
      COALESCE(NULLIF(p->>'MEDICO_NOME', ''), NULLIF(p->>'MEDICO', '')),
      NULLIF(p->>'ESPEC', ''),
      v_dt_evo, NULLIF(p->>'EVOLUCAO', ''), NULLIF(p->>'FLG_ANOTACAO', ''),
      upper(COALESCE(p->>'FLG_ANOTACAO', 'N')) = 'S',
      NULLIF(p->>'PRESSAO1', '')::numeric,
      NULLIF(p->>'PRESSAO2', '')::numeric,
      NULLIF(p->>'BPM', '')::numeric,
      NULLIF(p->>'TEMPERATURA', '')::numeric,
      NULLIF(p->>'SATURACAO', '')::numeric,
      NULLIF(p->>'CD_SITUACAO', ''),
      NULLIF(p->>'USUARIO', '')
    )
    ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
      profissional_id = EXCLUDED.profissional_id,
      profissional_nome = EXCLUDED.profissional_nome,
      especialidade = EXCLUDED.especialidade,
      data_hora = EXCLUDED.data_hora,
      evolucao = EXCLUDED.evolucao,
      flg_anotacao = EXCLUDED.flg_anotacao,
      anotacao = EXCLUDED.anotacao,
      pressao_sistolica = EXCLUDED.pressao_sistolica,
      pressao_diastolica = EXCLUDED.pressao_diastolica,
      bpm = EXCLUDED.bpm,
      temperatura = EXCLUDED.temperatura,
      saturacao = EXCLUDED.saturacao,
      situacao = EXCLUDED.situacao,
      usuario = EXCLUDED.usuario,
      updated_at = now();

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;
