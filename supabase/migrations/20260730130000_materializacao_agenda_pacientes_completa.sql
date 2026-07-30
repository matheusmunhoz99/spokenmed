-- Migration Master: Materialização Completa de Agendamentos e Pacientes (Firebird CADSOCIAL -> Supabase)

-- 1. Garante colunas de código de origem de integração em pacientes, unidades e profissionais
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE;
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE;
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE;

-- 2. Função para materializar Pacientes vindo da tabela CADSOCIAL do Firebird
CREATE OR REPLACE FUNCTION public.materializar_integracao_cadsocial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nmatricula text;
  v_nome text;
  v_cpf text;
  v_fone text;
  v_mae text;
BEGIN
  IF UPPER(COALESCE(NEW.tabela, '')) NOT IN ('CADSOCIAL', 'PACIENTE', 'PACIENTES') THEN
    RETURN NEW;
  END IF;

  v_nmatricula := COALESCE(NEW.payload->>'NMATRICULA', NEW.payload->>'CD_PACIENTE', NEW.chave_origem);
  v_nome := COALESCE(NEW.payload->>'NM_PACIENTE', NEW.payload->>'NOME', NEW.payload->>'PACIENTE');
  v_cpf := COALESCE(NEW.payload->>'CPF', NEW.payload->>'PACIENTE_CPF', '');
  v_fone := COALESCE(NEW.payload->>'TELEFONE', NEW.payload->>'FONE', '');
  v_mae := COALESCE(NEW.payload->>'MAE', NEW.payload->>'NMMAMAE', '');

  IF v_nome IS NULL OR LENGTH(TRIM(v_nome)) = 0 THEN
    RETURN NEW;
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
    NULLIF(v_cpf, ''),
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


-- 3. Função para materializar Agendamentos do Firebird
CREATE OR REPLACE FUNCTION public.materializar_integracao_agenda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nmatricula text;
  v_nm_paciente text;
  v_cpf text;
  v_paciente_id uuid;
  v_cd_unidade text;
  v_nm_unidade text;
  v_unidade_id uuid;
  v_cd_medico text;
  v_nm_medico text;
  v_profissional_id uuid;
  v_cd_agendamento text;
  v_data date;
  v_hora text;
  v_situacao text;
  v_is_encaixe boolean;
BEGIN
  IF UPPER(COALESCE(NEW.tabela, '')) NOT IN ('AGENDAMENTO', 'AGENDAMENTOS') THEN
    RETURN NEW;
  END IF;

  v_cd_agendamento := COALESCE(NEW.payload->>'CD_AGENDAMENTO', NEW.payload->>'ID_AGENDAMENTO', NEW.chave_origem);
  IF v_cd_agendamento IS NULL THEN
    RETURN NEW;
  END IF;

  v_nmatricula := COALESCE(NEW.payload->>'NMATRICULA', NEW.payload->>'CD_PACIENTE', NEW.payload->>'PACIENTE_ID');
  v_nm_paciente := COALESCE(NEW.payload->>'NM_PACIENTE', NEW.payload->>'PACIENTE', NEW.payload->>'NOME_PACIENTE', 'Paciente Firebird');
  v_cpf := COALESCE(NEW.payload->>'CPF', NEW.payload->>'PACIENTE_CPF', '');
  
  v_cd_unidade := COALESCE(NEW.payload->>'CD_UNIDADE', NEW.payload->>'UNIDADE_ID', '1');
  v_nm_unidade := COALESCE(NEW.payload->>'NM_UNIDADE', NEW.payload->>'UNIDADE', 'Unidade de Saúde');

  v_cd_medico := COALESCE(NEW.payload->>'CD_MEDICO', NEW.payload->>'CD_PROFISSIONAL', '1');
  v_nm_medico := COALESCE(NEW.payload->>'NM_MEDICO', NEW.payload->>'MEDICO', NEW.payload->>'PROFISSIONAL', 'Profissional Firebird');

  v_data := COALESCE(
    (NEW.payload->>'DATA')::date,
    (NEW.payload->>'DT_AGENDAMENTO')::date,
    CURRENT_DATE
  );
  v_hora := COALESCE(NEW.payload->>'HORA', NEW.payload->>'HORA_AGENDAMENTO', '08:00');
  v_situacao := LOWER(COALESCE(NEW.payload->>'SITUACAO', NEW.payload->>'STATUS', 'agendado'));
  v_is_encaixe := COALESCE((NEW.payload->>'IS_ENCAIXE')::boolean, false);

  -- 1. Busca ou Cria Paciente
  SELECT id INTO v_paciente_id
  FROM public.pacientes
  WHERE (v_nmatricula IS NOT NULL AND codigo_origem_firebird = v_nmatricula)
     OR (v_cpf <> '' AND cpf = v_cpf)
     OR (LOWER(nome) = LOWER(v_nm_paciente))
  LIMIT 1;

  IF v_paciente_id IS NULL THEN
    INSERT INTO public.pacientes (nome, cpf, codigo_origem_firebird)
    VALUES (v_nm_paciente, NULLIF(v_cpf, ''), v_nmatricula)
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

  -- 4. Insere ou Atualiza Agendamento
  IF v_paciente_id IS NOT NULL AND v_unidade_id IS NOT NULL AND v_profissional_id IS NOT NULL THEN
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
      v_hora,
      v_situacao,
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_materializar_agenda ON public.integracao_registros;
CREATE TRIGGER trigger_materializar_agenda
  AFTER INSERT OR UPDATE ON public.integracao_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.materializar_integracao_agenda();


-- 4. EXECUTA A MATERIALIZAÇÃO RETROATIVA COMPLETA DISPARANDO O GATILHO EM TODOS OS REGISTROS JÁ INGERIDOS!
UPDATE public.integracao_registros 
SET updated_at = now() 
WHERE UPPER(COALESCE(tabela, '')) IN ('CADSOCIAL', 'PACIENTE', 'PACIENTES', 'AGENDAMENTO', 'AGENDAMENTOS');
