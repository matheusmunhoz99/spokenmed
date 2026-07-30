-- Migration Master (V9): Suporte a Histórico Antigo (2018 até hoje) com Parser Seguro de Datas

CREATE OR REPLACE FUNCTION public.parse_firebird_date(p_val text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_val IS NULL OR TRIM(p_val) = '' THEN
    RETURN CURRENT_DATE;
  END IF;
  
  -- Se for no formato ISO 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:MI:SS'
  IF p_val ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN (SUBSTRING(p_val FROM 1 FOR 10))::date;
  END IF;
  
  -- Se for no formato brasileiro 'DD/MM/YYYY'
  IF p_val ~ '^\d{2}/\d{2}/\d{4}' THEN
    RETURN to_date(SUBSTRING(p_val FROM 1 FOR 10), 'DD/MM/YYYY');
  END IF;
  
  RETURN p_val::date;
EXCEPTION WHEN OTHERS THEN
  RETURN CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.clean_cpf(p_cpf text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cleaned text;
BEGIN
  IF p_cpf IS NULL THEN RETURN NULL; END IF;
  v_cleaned := REGEXP_REPLACE(p_cpf, '\D', '', 'g');
  IF LENGTH(v_cleaned) <> 11 OR v_cleaned IN ('00000000000', '11111111111', '22222222222', '33333333333', '44444444444', '55555555555', '66666666666', '77777777777', '88888888888', '99999999999') THEN
    RETURN NULL;
  END IF;
  RETURN v_cleaned;
END;
$$;

-- 1. Bypass de reserva de slot interno para agendamentos do Firebird
CREATE OR REPLACE FUNCTION public.fn_ag_reserva_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.codigo_origem_firebird IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.agenda_slot_id IS NULL AND (NEW.is_encaixe IS NOT TRUE) THEN
    NEW.is_encaixe := true;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Colunas de Código de Origem de Integração
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE;
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE;
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE;
ALTER TABLE public.encaminhamentos ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE;

-- 3. Função para materializar Pacientes (CADSOCIAL / PACIENTE)
CREATE OR REPLACE FUNCTION public.materializar_integracao_cadsocial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nmatricula text;
  v_nome text;
  v_cpf_raw text;
  v_cpf_limpo text;
  v_fone text;
  v_mae text;
BEGIN
  IF UPPER(COALESCE(NEW.tabela, '')) NOT IN ('CADSOCIAL', 'PACIENTE', 'PACIENTES') THEN
    RETURN NEW;
  END IF;

  v_nmatricula := COALESCE(NEW.payload->>'NMATRICULA', NEW.payload->>'CD_PACIENTE', NEW.chave_origem);
  v_nome := COALESCE(NEW.payload->>'NM_PACIENTE', NEW.payload->>'NOME', NEW.payload->>'PACIENTE');
  v_cpf_raw := COALESCE(NEW.payload->>'CPF', NEW.payload->>'PACIENTE_CPF', '');
  v_cpf_limpo := public.clean_cpf(v_cpf_raw);
  v_fone := COALESCE(NEW.payload->>'TELEFONE', NEW.payload->>'FONE', NEW.payload->>'CELULAR', '');
  v_mae := COALESCE(NEW.payload->>'MAE', NEW.payload->>'NMMAMAE', '');

  IF v_nome IS NULL OR LENGTH(TRIM(v_nome)) = 0 THEN
    RETURN NEW;
  END IF;

  IF v_cpf_limpo IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pacientes 
    WHERE cpf = v_cpf_limpo AND (v_nmatricula IS NULL OR codigo_origem_firebird <> v_nmatricula)
  ) THEN
    v_cpf_limpo := NULL;
  END IF;

  INSERT INTO public.pacientes (
    codigo_origem_firebird,
    nome,
    cpf,
    telefone,
    nome_mae
  ) VALUES (
    v_nmatricula,
    v_nome,
    v_cpf_limpo,
    NULLIF(v_fone, ''),
    NULLIF(v_mae, '')
  )
  ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
    nome = EXCLUDED.nome,
    cpf = COALESCE(EXCLUDED.cpf, public.pacientes.cpf),
    telefone = COALESCE(EXCLUDED.telefone, public.pacientes.telefone),
    nome_mae = COALESCE(EXCLUDED.nome_mae, public.pacientes.nome_mae),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_materializar_cadsocial ON public.integracao_registros;
CREATE TRIGGER trigger_materializar_cadsocial
  AFTER INSERT OR UPDATE ON public.integracao_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.materializar_integracao_cadsocial();


-- 4. Função para materializar Agendamentos do Firebird com parse_firebird_date
CREATE OR REPLACE FUNCTION public.materializar_integracao_agenda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nmatricula text;
  v_nm_paciente text;
  v_cpf_raw text;
  v_cpf_limpo text;
  v_paciente_id uuid;
  v_cd_unidade text;
  v_nm_unidade text;
  v_unidade_id uuid;
  v_cd_medico text;
  v_nm_medico text;
  v_profissional_id uuid;
  v_cd_agendamento text;
  v_data date;
  v_hora_str text;
  v_hora_time time;
  v_situacao_raw text;
  v_status_enum public.agendamento_status;
  v_is_encaixe boolean;
BEGIN
  IF UPPER(COALESCE(NEW.tabela, '')) NOT IN ('AGENDA', 'AGENDAMENTO', 'AGENDAMENTOS', 'AGENDAMEDICA', 'AGENDASERV', 'AGENDAINTERNA') THEN
    RETURN NEW;
  END IF;

  v_cd_agendamento := COALESCE(NEW.payload->>'CD_AGENDAMENTO', NEW.payload->>'CD_AGENDA', NEW.payload->>'ID_AGENDAMENTO', NEW.chave_origem);
  IF v_cd_agendamento IS NULL THEN
    RETURN NEW;
  END IF;

  v_nmatricula := COALESCE(NEW.payload->>'NMATRICULA', NEW.payload->>'CD_PACIENTE', NEW.payload->>'PACIENTE_ID');
  v_nm_paciente := COALESCE(NEW.payload->>'NM_PACIENTE', NEW.payload->>'PACIENTE', NEW.payload->>'NOME', 'Paciente Firebird');
  v_cpf_raw := COALESCE(NEW.payload->>'CPF', NEW.payload->>'PACIENTE_CPF', '');
  v_cpf_limpo := public.clean_cpf(v_cpf_raw);
  
  v_cd_unidade := COALESCE(NEW.payload->>'CD_UNIDADE', NEW.payload->>'UNIDADE_ID', '1');
  v_nm_unidade := COALESCE(NEW.payload->>'NM_UNIDADE', NEW.payload->>'UNIDADE', 'Unidade de Saúde');

  v_cd_medico := COALESCE(NEW.payload->>'CD_MEDICO', NEW.payload->>'CD_PROFISSIONAL', '1');
  v_nm_medico := COALESCE(NEW.payload->>'NM_MEDICO', NEW.payload->>'MEDICO', NEW.payload->>'PROFISSIONAL', 'Profissional Firebird');

  v_data := public.parse_firebird_date(
    COALESCE(NEW.payload->>'DATA', NEW.payload->>'DATAAGEND', NEW.payload->>'DT_AGENDAMENTO', '')
  );

  v_hora_str := COALESCE(NEW.payload->>'HORA', NEW.payload->>'HORA_AGENDAMENTO', '08:00');
  BEGIN
    v_hora_time := v_hora_str::time;
  EXCEPTION WHEN OTHERS THEN
    v_hora_time := '08:00'::time;
  END;

  v_situacao_raw := LOWER(COALESCE(NEW.payload->>'SITUACAO', NEW.payload->>'STATUS', 'agendado'));
  CASE v_situacao_raw
    WHEN 'atendido' THEN v_status_enum := 'atendido'::public.agendamento_status;
    WHEN 'faltou' THEN v_status_enum := 'faltou'::public.agendamento_status;
    WHEN 'cancelado' THEN v_status_enum := 'cancelado'::public.agendamento_status;
    WHEN 'confirmado' THEN v_status_enum := 'confirmado'::public.agendamento_status;
    WHEN 'em_atendimento' THEN v_status_enum := 'em_atendimento'::public.agendamento_status;
    ELSE v_status_enum := 'agendado'::public.agendamento_status;
  END CASE;

  v_is_encaixe := COALESCE((NEW.payload->>'IS_ENCAIXE')::boolean, true);

  IF v_cpf_limpo IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pacientes 
    WHERE cpf = v_cpf_limpo AND (v_nmatricula IS NULL OR codigo_origem_firebird <> v_nmatricula)
  ) THEN
    v_cpf_limpo := NULL;
  END IF;

  -- 1. Busca ou Cria Paciente
  SELECT id INTO v_paciente_id
  FROM public.pacientes
  WHERE (v_nmatricula IS NOT NULL AND codigo_origem_firebird = v_nmatricula)
     OR (v_cpf_limpo IS NOT NULL AND cpf = v_cpf_limpo)
     OR (LOWER(nome) = LOWER(v_nm_paciente))
  LIMIT 1;

  IF v_paciente_id IS NULL THEN
    INSERT INTO public.pacientes (nome, cpf, codigo_origem_firebird)
    VALUES (v_nm_paciente, v_cpf_limpo, v_nmatricula)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_paciente_id;

    IF v_paciente_id IS NULL THEN
      SELECT id INTO v_paciente_id FROM public.pacientes WHERE LOWER(nome) = LOWER(v_nm_paciente) LIMIT 1;
    END IF;
  ELSE
    IF v_nmatricula IS NOT NULL THEN
      UPDATE public.pacientes SET codigo_origem_firebird = v_nmatricula WHERE id = v_paciente_id AND codigo_origem_firebird IS NULL;
    END IF;
  END IF;

  -- 2. Busca ou Cria Unidade
  SELECT id INTO v_unidade_id
  FROM public.unidades
  WHERE (v_cd_unidade IS NOT NULL AND codigo_origem_firebird = v_cd_unidade)
     OR LOWER(nome) = LOWER(v_nm_unidade)
  LIMIT 1;

  IF v_unidade_id IS NULL THEN
    INSERT INTO public.unidades (nome, codigo_origem_firebird)
    VALUES (v_nm_unidade, v_cd_unidade)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_unidade_id;

    IF v_unidade_id IS NULL THEN
      SELECT id INTO v_unidade_id FROM public.unidades WHERE LOWER(nome) = LOWER(v_nm_unidade) LIMIT 1;
    END IF;
  END IF;

  -- 3. Busca ou Cria Profissional
  SELECT id INTO v_profissional_id
  FROM public.profissionais
  WHERE (v_cd_medico IS NOT NULL AND codigo_origem_firebird = v_cd_medico)
     OR LOWER(nome) = LOWER(v_nm_medico)
  LIMIT 1;

  IF v_profissional_id IS NULL THEN
    INSERT INTO public.profissionais (nome, codigo_origem_firebird)
    VALUES (v_nm_medico, v_cd_medico)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_profissional_id;

    IF v_profissional_id IS NULL THEN
      SELECT id INTO v_profissional_id FROM public.profissionais WHERE LOWER(nome) = LOWER(v_nm_medico) LIMIT 1;
    END IF;
  END IF;

  -- 4. Insere ou Atualiza Agendamento tratando conflitos
  IF v_paciente_id IS NOT NULL AND v_unidade_id IS NOT NULL AND v_profissional_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.agendamentos (
        codigo_origem_firebird,
        paciente_id,
        unidade_id,
        profissional_id,
        data,
        hora_inicio,
        status,
        is_encaixe
      ) VALUES (
        v_cd_agendamento,
        v_paciente_id,
        v_unidade_id,
        v_profissional_id,
        v_data,
        v_hora_time,
        v_status_enum,
        v_is_encaixe
      )
      ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
        paciente_id = EXCLUDED.paciente_id,
        unidade_id = EXCLUDED.unidade_id,
        profissional_id = EXCLUDED.profissional_id,
        data = EXCLUDED.data,
        hora_inicio = EXCLUDED.hora_inicio,
        status = EXCLUDED.status,
        is_encaixe = EXCLUDED.is_encaixe,
        updated_at = now();
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.agendamentos SET
        codigo_origem_firebird = v_cd_agendamento,
        unidade_id = v_unidade_id,
        profissional_id = v_profissional_id,
        status = v_status_enum,
        updated_at = now()
      WHERE paciente_id = v_paciente_id AND data = v_data AND hora_inicio = v_hora_time;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_materializar_agenda ON public.integracao_registros;
CREATE TRIGGER trigger_materializar_agenda
  AFTER INSERT OR UPDATE ON public.integracao_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.materializar_integracao_agenda();
