-- Migration para integração total de Agendas, Vagas, Horários e Agendamentos do Firebird
-- Suporta tabelas AGENDAMEDICA, AGENDA, AGENDAMENTO, AGENDA_HORARIO do Fiorilli SSA.

ALTER TABLE IF EXISTS public.agendas
  ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE,
  ADD COLUMN IF NOT EXISTS sincronizado_firebird boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS total_vagas integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vagas_ocupadas integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vagas_disponiveis integer DEFAULT 0;

ALTER TABLE IF EXISTS public.agendamentos
  ADD COLUMN IF NOT EXISTS codigo_origem_firebird text UNIQUE,
  ADD COLUMN IF NOT EXISTS sincronizado_firebird boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS horario_origem_firebird text,
  ADD COLUMN IF NOT EXISTS prioridade text DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS agendas_firebird_idx ON public.agendas(codigo_origem_firebird);
CREATE INDEX IF NOT EXISTS agendamentos_firebird_idx ON public.agendamentos(codigo_origem_firebird);

-- Função PL/pgSQL para materializar Agendas e Agendamentos do Firebird
CREATE OR REPLACE FUNCTION public.materializar_integracao_agenda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payload jsonb;
  v_tabela text;
  v_codigo_agenda text;
  v_codigo_agendamento text;
  v_codigo_unidade text;
  v_codigo_medico text;
  v_codigo_especialidade text;
  v_codigo_paciente text;
  v_cpf_paciente text;
  v_unidade_id uuid;
  v_profissional_id uuid;
  v_especialidade_id uuid;
  v_paciente_id uuid;
  v_agenda_id uuid;
  v_data date;
  v_hora text;
  v_vagas integer;
  v_situacao text;
  v_prioridade text;
  v_observacoes text;
BEGIN
  v_tabela := UPPER(COALESCE(NEW.tabela, ''));
  v_payload := NEW.payload;

  IF v_tabela NOT IN ('AGENDAMEDICA', 'AGENDA', 'AGENDAS', 'AGENDAMENTO', 'AGENDAMENTOS', 'AGENDA_HORARIO') THEN
    RETURN NEW;
  END IF;

  -- 1. Extração de Chaves de Origem
  v_codigo_unidade := COALESCE(v_payload->>'CD_UNIDADE', v_payload->>'UNIDADE_ID', v_payload->>'CD_UNIDADE_SAUDE');
  v_codigo_medico := COALESCE(v_payload->>'CD_MEDICO', v_payload->>'CD_PROFISSIONAL', v_payload->>'MEDICO_ID');
  v_codigo_especialidade := COALESCE(v_payload->>'CD_ESPECIALIDADE', v_payload->>'ESPECIALIDADE_ID');
  v_codigo_paciente := COALESCE(v_payload->>'CD_PACIENTE', v_payload->>'PACIENTE_ID', v_payload->>'ID_PACIENTE');
  v_cpf_paciente := regexp_replace(COALESCE(v_payload->>'CPF', v_payload->>'PACIENTE_CPF', ''), '\D', '', 'g');

  -- Resolver Unidade por Código Firebird ou Padrão
  IF v_codigo_unidade IS NOT NULL THEN
    SELECT id INTO v_unidade_id FROM public.unidades WHERE codigo_origem_firebird = v_codigo_unidade LIMIT 1;
  END IF;
  IF v_unidade_id IS NULL THEN
    SELECT id INTO v_unidade_id FROM public.unidades ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Resolver Profissional por Código Firebird
  IF v_codigo_medico IS NOT NULL THEN
    SELECT id INTO v_profissional_id FROM public.profissionais WHERE codigo_origem_firebird = v_codigo_medico LIMIT 1;
  END IF;

  -- Resolver Especialidade por Código Firebird
  IF v_codigo_especialidade IS NOT NULL THEN
    SELECT id INTO v_especialidade_id FROM public.especialidades WHERE codigo_origem_firebird = v_codigo_especialidade LIMIT 1;
  END IF;

  --------------------------------------------------------------------------------
  -- A. PROCESSAMENTO DE CABEÇALHO DA AGENDA (AGENDAMEDICA / AGENDA)
  --------------------------------------------------------------------------------
  IF v_tabela IN ('AGENDAMEDICA', 'AGENDA', 'AGENDAS') THEN
    v_codigo_agenda := COALESCE(v_payload->>'CD_AGENDA', v_payload->>'ID_AGENDA', NEW.chave_origem);
    IF v_codigo_agenda IS NULL THEN RETURN NEW; END IF;

    v_data := COALESCE((v_payload->>'DATA')::date, (v_payload->>'DT_AGENDA')::date, CURRENT_DATE);
    v_vagas := COALESCE((v_payload->>'QTDE_VAGAS')::integer, (v_payload->>'VAGAS')::integer, 20);

    INSERT INTO public.agendas (
      codigo_origem_firebird,
      unidade_id,
      profissional_id,
      especialidade_id,
      data,
      total_vagas,
      sincronizado_firebird,
      updated_at
    ) VALUES (
      v_codigo_agenda,
      v_unidade_id,
      v_profissional_id,
      v_especialidade_id,
      v_data,
      v_vagas,
      true,
      now()
    )
    ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
      unidade_id = COALESCE(EXCLUDED.unidade_id, public.agendas.unidade_id),
      profissional_id = COALESCE(EXCLUDED.profissional_id, public.agendas.profissional_id),
      especialidade_id = COALESCE(EXCLUDED.especialidade_id, public.agendas.especialidade_id),
      data = EXCLUDED.data,
      total_vagas = EXCLUDED.total_vagas,
      sincronizado_firebird = true,
      updated_at = now();

    RETURN NEW;
  END IF;

  --------------------------------------------------------------------------------
  -- B. PROCESSAMENTO DE ITENS DE AGENDAMENTO (AGENDAMENTO / AGENDA_HORARIO)
  --------------------------------------------------------------------------------
  IF v_tabela IN ('AGENDAMENTO', 'AGENDAMENTOS', 'AGENDA_HORARIO') THEN
    v_codigo_agendamento := COALESCE(v_payload->>'CD_AGENDAMENTO', v_payload->>'ID_AGENDAMENTO', NEW.chave_origem);
    v_codigo_agenda := COALESCE(v_payload->>'CD_AGENDA', v_payload->>'ID_AGENDA');
    IF v_codigo_agendamento IS NULL THEN RETURN NEW; END IF;

    -- Tentar encontrar agenda mãe
    IF v_codigo_agenda IS NOT NULL THEN
      SELECT id INTO v_agenda_id FROM public.agendas WHERE codigo_origem_firebird = v_codigo_agenda LIMIT 1;
    END IF;

    -- Resolver Paciente
    IF v_codigo_paciente IS NOT NULL THEN
      SELECT id INTO v_paciente_id FROM public.pacientes WHERE codigo_origem_firebird = v_codigo_paciente LIMIT 1;
    END IF;
    IF v_paciente_id IS NULL AND v_cpf_paciente <> '' THEN
      SELECT id INTO v_paciente_id FROM public.pacientes WHERE regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = v_cpf_paciente LIMIT 1;
    END IF;

    v_data := COALESCE((v_payload->>'DATA')::date, (v_payload->>'DT_AGENDAMENTO')::date, (v_payload->>'DATA_AGENDAMENTO')::date, CURRENT_DATE);
    v_hora := COALESCE(v_payload->>'HORA', v_payload->>'HORA_AGENDAMENTO', '08:00');
    v_situacao := LOWER(COALESCE(v_payload->>'SITUACAO', v_payload->>'STATUS', 'agendado'));
    v_prioridade := LOWER(COALESCE(v_payload->>'PRIORIDADE', 'normal'));
    v_observacoes := COALESCE(v_payload->>'OBSERVACAO', v_payload->>'OBSERVACOES', '');

    -- Normalizar Status
    IF v_situacao LIKE '%atend%' OR v_situacao LIKE '%conclu%' THEN v_situacao := 'atendido';
    ELSIF v_situacao LIKE '%canc%' THEN v_situacao := 'cancelado';
    ELSIF v_situacao LIKE '%falt%' OR v_situacao LIKE '%ausen%' THEN v_situacao := 'falta';
    ELSE v_situacao := 'agendado';
    END IF;

    IF v_paciente_id IS NOT NULL THEN
      INSERT INTO public.agendamentos (
        codigo_origem_firebird,
        agenda_id,
        paciente_id,
        profissional_id,
        unidade_id,
        especialidade_id,
        data,
        horario,
        horario_origem_firebird,
        status,
        prioridade,
        observacoes,
        sincronizado_firebird,
        updated_at
      ) VALUES (
        v_codigo_agendamento,
        v_agenda_id,
        v_paciente_id,
        v_profissional_id,
        v_unidade_id,
        v_especialidade_id,
        v_data,
        v_hora,
        v_hora,
        v_situacao,
        v_prioridade,
        v_observacoes,
        true,
        now()
      )
      ON CONFLICT (codigo_origem_firebird) DO UPDATE SET
        agenda_id = COALESCE(EXCLUDED.agenda_id, public.agendamentos.agenda_id),
        paciente_id = EXCLUDED.paciente_id,
        profissional_id = COALESCE(EXCLUDED.profissional_id, public.agendamentos.profissional_id),
        unidade_id = COALESCE(EXCLUDED.unidade_id, public.agendamentos.unidade_id),
        especialidade_id = COALESCE(EXCLUDED.especialidade_id, public.agendamentos.especialidade_id),
        data = EXCLUDED.data,
        horario = EXCLUDED.horario,
        status = EXCLUDED.status,
        prioridade = EXCLUDED.prioridade,
        observacoes = EXCLUDED.observacoes,
        sincronizado_firebird = true,
        updated_at = now();
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_materializar_agenda ON public.integracao_registros;
CREATE TRIGGER trigger_materializar_agenda
  AFTER INSERT OR UPDATE ON public.integracao_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.materializar_integracao_agenda();
