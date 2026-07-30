-- Corrige a integração da agenda real do Fiorilli.
-- Neste banco, AGENDA contém os pacientes agendados; AGENDA_VAGAS contém a
-- capacidade. Os lotes antigos AGENDAMEDICA eram uma interpretação incorreta.

CREATE OR REPLACE FUNCTION public.parse_firebird_date(p_val text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_val IS NULL OR trim(p_val) = '' THEN RETURN NULL; END IF;
  IF p_val ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN substring(p_val from 1 for 10)::date;
  END IF;
  IF p_val ~ '^\d{2}/\d{2}/\d{4}' THEN
    RETURN to_date(substring(p_val from 1 for 10), 'DD/MM/YYYY');
  END IF;
  RETURN p_val::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.integracao_materializacao_erros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_registro_id uuid,
  tabela text NOT NULL,
  chave_origem text,
  erro text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integracao_materializacao_erros_registro_idx
  ON public.integracao_materializacao_erros(integracao_registro_id);

ALTER TABLE public.integracao_materializacao_erros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem ver erros de materializacao"
  ON public.integracao_materializacao_erros;
CREATE POLICY "Admins podem ver erros de materializacao"
  ON public.integracao_materializacao_erros
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.materializar_integracao_agenda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p jsonb := NEW.payload;
  v_codigo text;
  v_matricula text;
  v_nome_paciente text;
  v_cpf text;
  v_unidade_codigo text;
  v_unidade_nome text;
  v_medico_codigo text;
  v_medico_nome text;
  v_paciente_id uuid;
  v_unidade_id uuid;
  v_profissional_id uuid;
  v_agendamento_id uuid;
  v_data date;
  v_hora time;
  v_status public.agendamento_status := 'agendado';
  v_realizou text;
  v_situacao text;
  v_is_encaixe boolean := false;
BEGIN
  -- Ignora definitivamente os cabeçalhos falsos exportados pelas versões antigas.
  IF upper(coalesce(NEW.tabela, '')) <> 'AGENDAMENTO' THEN
    RETURN NEW;
  END IF;

  v_codigo := nullif(coalesce(p->>'CD_AGENDAMENTO', NEW.chave_origem), '');
  v_matricula := nullif(coalesce(p->>'NMATRICULA', p->>'CD_PACIENTE'), '');
  v_nome_paciente := nullif(trim(coalesce(p->>'NM_PACIENTE', p->>'PACIENTE_NOME', '')), '');
  v_cpf := public.clean_cpf(coalesce(p->>'CPF', p->>'PACIENTE_CPF'));
  v_unidade_codigo := nullif(p->>'CD_UNIDADE', '');
  v_unidade_nome := nullif(trim(coalesce(p->>'NM_UNIDADE', p->>'UNIDADE_NOME', '')), '');
  v_medico_codigo := nullif(p->>'CD_MEDICO', '');
  v_medico_nome := nullif(trim(coalesce(p->>'NM_MEDICO', p->>'MEDICO_NOME', '')), '');

  IF v_codigo IS NULL OR v_matricula IS NULL THEN
    RAISE EXCEPTION 'Agendamento sem código ou matrícula';
  END IF;

  v_data := public.parse_firebird_date(coalesce(p->>'DATA', p->>'DATAAGEND'));
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'Data inválida no agendamento %', v_codigo;
  END IF;

  BEGIN
    v_hora := nullif(substring(coalesce(p->>'HORA', '') from 1 for 8), '')::time;
  EXCEPTION WHEN OTHERS THEN
    v_hora := '00:00:00'::time;
  END;
  v_hora := coalesce(v_hora, '00:00:00'::time);

  v_realizou := upper(trim(coalesce(p->>'FLG_REALIZOU', '')));
  v_situacao := lower(trim(coalesce(p->>'SITUACAO', '')));
  IF v_realizou = 'S' OR v_situacao IN ('atendido', 'realizado', 'concluido', 'concluído') THEN
    v_status := 'atendido';
  ELSIF v_realizou = 'C' OR v_situacao = 'cancelado' THEN
    v_status := 'cancelado';
  ELSIF v_realizou IN ('F', 'N') OR v_situacao IN ('faltou', 'falta', 'ausente') THEN
    v_status := 'faltou';
  ELSIF v_situacao = 'confirmado' THEN
    v_status := 'confirmado';
  ELSE
    v_status := 'agendado';
  END IF;

  BEGIN
    v_is_encaixe := lower(coalesce(p->>'IS_ENCAIXE', 'false')) IN ('true', '1', 's', 'sim');
  EXCEPTION WHEN OTHERS THEN
    v_is_encaixe := false;
  END;

  -- Paciente: primeiro pela matrícula, depois pelo CPF. Isso evita duplicação.
  SELECT id INTO v_paciente_id
  FROM public.pacientes
  WHERE codigo_origem_firebird = v_matricula
  LIMIT 1;

  IF v_paciente_id IS NULL AND v_cpf IS NOT NULL THEN
    SELECT id INTO v_paciente_id
    FROM public.pacientes
    WHERE cpf = v_cpf
    LIMIT 1;
  END IF;

  IF v_paciente_id IS NULL THEN
    INSERT INTO public.pacientes (
      codigo_origem_firebird, nome, cpf, telefone, cns, data_nascimento,
      sexo, nome_mae, ativo
    )
    VALUES (
      v_matricula,
      coalesce(v_nome_paciente, 'Paciente ' || v_matricula),
      v_cpf,
      nullif(coalesce(p->>'FONE', p->>'PACIENTE_FONE'), ''),
      nullif(p->>'CNS', ''),
      public.parse_firebird_date(p->>'DATANASCIMENTO'),
      CASE WHEN upper(coalesce(p->>'SEXO', '')) IN ('M','F','O')
        THEN upper(p->>'SEXO')::public.sexo_tipo ELSE NULL END,
      nullif(p->>'PACIENTE_MAE', ''),
      true
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_paciente_id;

    IF v_paciente_id IS NULL THEN
      SELECT id INTO v_paciente_id
      FROM public.pacientes
      WHERE codigo_origem_firebird = v_matricula
         OR (v_cpf IS NOT NULL AND cpf = v_cpf)
      LIMIT 1;
    END IF;
  ELSE
    UPDATE public.pacientes
    SET codigo_origem_firebird = coalesce(codigo_origem_firebird, v_matricula),
        nome = coalesce(v_nome_paciente, nome),
        telefone = coalesce(nullif(coalesce(p->>'FONE', p->>'PACIENTE_FONE'), ''), telefone),
        updated_at = now()
    WHERE id = v_paciente_id;
  END IF;

  -- Unidade real do Firebird.
  IF v_unidade_codigo IS NOT NULL THEN
    INSERT INTO public.unidades (codigo_origem_firebird, nome, ativo)
    VALUES (
      v_unidade_codigo,
      coalesce(v_unidade_nome, 'Unidade ' || v_unidade_codigo),
      true
    )
    ON CONFLICT (codigo_origem_firebird) DO UPDATE
    SET nome = coalesce(v_unidade_nome, public.unidades.nome),
        ativo = true
    RETURNING id INTO v_unidade_id;
  END IF;

  -- Profissional real do Firebird.
  IF v_medico_codigo IS NOT NULL THEN
    INSERT INTO public.profissionais (codigo_origem_firebird, nome, ativo)
    VALUES (
      v_medico_codigo,
      coalesce(v_medico_nome, 'Profissional ' || v_medico_codigo),
      true
    )
    ON CONFLICT (codigo_origem_firebird) DO UPDATE
    SET nome = coalesce(v_medico_nome, public.profissionais.nome),
        ativo = true,
        updated_at = now()
    RETURNING id INTO v_profissional_id;
  END IF;

  IF v_paciente_id IS NULL OR v_unidade_id IS NULL OR v_profissional_id IS NULL THEN
    RAISE EXCEPTION 'Relacionamentos ausentes no agendamento % (paciente %, unidade %, profissional %)',
      v_codigo, v_paciente_id, v_unidade_id, v_profissional_id;
  END IF;

  -- Primeiro atualiza pela chave Firebird.
  UPDATE public.agendamentos
  SET paciente_id = v_paciente_id,
      unidade_id = v_unidade_id,
      profissional_id = v_profissional_id,
      data = v_data,
      hora_inicio = v_hora,
      status = v_status,
      is_encaixe = v_is_encaixe,
      observacoes = nullif(p->>'OBSERVACAO', ''),
      sincronizado_firebird = true,
      horario_origem_firebird = p->>'HORA',
      updated_at = now()
  WHERE codigo_origem_firebird = v_codigo
  RETURNING id INTO v_agendamento_id;

  -- Se já existe a mesma marcação criada no site, vincula em vez de duplicar.
  IF v_agendamento_id IS NULL THEN
    SELECT id INTO v_agendamento_id
    FROM public.agendamentos
    WHERE paciente_id = v_paciente_id
      AND data = v_data
      AND hora_inicio = v_hora
    ORDER BY created_at
    LIMIT 1;

    IF v_agendamento_id IS NOT NULL THEN
      UPDATE public.agendamentos
      SET codigo_origem_firebird = v_codigo,
          unidade_id = v_unidade_id,
          profissional_id = v_profissional_id,
          status = v_status,
          is_encaixe = v_is_encaixe,
          observacoes = coalesce(nullif(p->>'OBSERVACAO', ''), observacoes),
          sincronizado_firebird = true,
          horario_origem_firebird = p->>'HORA',
          updated_at = now()
      WHERE id = v_agendamento_id;
    ELSE
      INSERT INTO public.agendamentos (
        codigo_origem_firebird, paciente_id, unidade_id, profissional_id,
        data, hora_inicio, status, is_encaixe, observacoes,
        sincronizado_firebird, horario_origem_firebird
      )
      VALUES (
        v_codigo, v_paciente_id, v_unidade_id, v_profissional_id,
        v_data, v_hora, v_status, v_is_encaixe, nullif(p->>'OBSERVACAO', ''),
        true, p->>'HORA'
      );
    END IF;
  END IF;

  DELETE FROM public.integracao_materializacao_erros
  WHERE integracao_registro_id = NEW.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.integracao_materializacao_erros (
    integracao_registro_id, tabela, chave_origem, erro
  )
  VALUES (NEW.id, NEW.tabela, NEW.chave_origem, SQLERRM);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_materializar_agenda ON public.integracao_registros;
CREATE TRIGGER trigger_materializar_agenda
  AFTER INSERT OR UPDATE OF payload ON public.integracao_registros
  FOR EACH ROW
  WHEN (upper(NEW.tabela) = 'AGENDAMENTO')
  EXECUTE FUNCTION public.materializar_integracao_agenda();
