
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'recepcionista');
CREATE TYPE public.agendamento_status AS ENUM ('agendado','confirmado','atendido','faltou','cancelado');
CREATE TYPE public.slot_status AS ENUM ('livre','reservado','bloqueado');
CREATE TYPE public.sexo_tipo AS ENUM ('M','F','O');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cargo text,
  telefone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function (security definer, evita recursão)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

-- ============ HANDLE NEW USER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first boolean;
BEGIN
  INSERT INTO public.profiles (id, nome, cargo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'cargo'
  );

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recepcionista');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ UNIDADES ============
CREATE TABLE public.unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  endereco text,
  telefone text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_unidades_updated BEFORE UPDATE ON public.unidades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ESPECIALIDADES ============
CREATE TABLE public.especialidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;

-- ============ PROFISSIONAIS ============
CREATE TABLE public.profissionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  conselho text,           -- ex CRM, COREN
  conselho_numero text,
  conselho_uf text,
  especialidade_id uuid REFERENCES public.especialidades(id),
  unidade_id uuid REFERENCES public.unidades(id),
  email text,
  telefone text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profissionais_updated BEFORE UPDATE ON public.profissionais FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PACIENTES ============
CREATE TABLE public.pacientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text UNIQUE,
  cns text UNIQUE,            -- cartão SUS
  rg text,
  data_nascimento date,
  sexo public.sexo_tipo,
  nome_mae text,
  telefone text,
  email text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pacientes_updated BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ AGENDAS_CONFIG ============
CREATE TABLE public.agendas_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.unidades(id),
  dias_semana int[] NOT NULL,           -- 0=domingo .. 6=sábado
  manha_inicio time,
  manha_fim time,
  tarde_inicio time,
  tarde_fim time,
  duracao_min int NOT NULL DEFAULT 30 CHECK (duracao_min BETWEEN 5 AND 240),
  vigencia_inicio date NOT NULL,
  vigencia_fim date NOT NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agendas_config ENABLE ROW LEVEL SECURITY;

-- ============ SLOTS ============
CREATE TABLE public.slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.unidades(id),
  data date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  status public.slot_status NOT NULL DEFAULT 'livre',
  agenda_config_id uuid REFERENCES public.agendas_config(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profissional_id, data, hora_inicio)
);
CREATE INDEX idx_slots_data ON public.slots(data);
CREATE INDEX idx_slots_prof_data ON public.slots(profissional_id, data);
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;

-- ============ AGENDAMENTOS ============
CREATE TABLE public.agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL UNIQUE REFERENCES public.slots(id) ON DELETE RESTRICT,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id),
  unidade_id uuid REFERENCES public.unidades(id),
  data date NOT NULL,
  hora_inicio time NOT NULL,
  status public.agendamento_status NOT NULL DEFAULT 'agendado',
  motivo text,
  observacoes text,
  criado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ag_data ON public.agendamentos(data);
CREATE INDEX idx_ag_paciente ON public.agendamentos(paciente_id);
CREATE INDEX idx_ag_prof ON public.agendamentos(profissional_id);
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ag_updated BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ GERAR SLOTS RPC ============
CREATE OR REPLACE FUNCTION public.gerar_slots(_config_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.agendas_config%ROWTYPE;
  d date;
  dow int;
  t time;
  fim_bloco time;
  count_inserted int := 0;
BEGIN
  SELECT * INTO cfg FROM public.agendas_config WHERE id = _config_id;
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'Configuração não encontrada'; END IF;

  d := cfg.vigencia_inicio;
  WHILE d <= cfg.vigencia_fim LOOP
    dow := EXTRACT(DOW FROM d)::int;  -- 0..6
    IF dow = ANY(cfg.dias_semana) THEN
      -- bloco manhã
      IF cfg.manha_inicio IS NOT NULL AND cfg.manha_fim IS NOT NULL THEN
        t := cfg.manha_inicio;
        WHILE t + (cfg.duracao_min || ' minutes')::interval <= cfg.manha_fim LOOP
          fim_bloco := t + (cfg.duracao_min || ' minutes')::interval;
          BEGIN
            INSERT INTO public.slots(profissional_id, unidade_id, data, hora_inicio, hora_fim, agenda_config_id)
            VALUES (cfg.profissional_id, cfg.unidade_id, d, t, fim_bloco, cfg.id);
            count_inserted := count_inserted + 1;
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
          t := fim_bloco;
        END LOOP;
      END IF;
      -- bloco tarde
      IF cfg.tarde_inicio IS NOT NULL AND cfg.tarde_fim IS NOT NULL THEN
        t := cfg.tarde_inicio;
        WHILE t + (cfg.duracao_min || ' minutes')::interval <= cfg.tarde_fim LOOP
          fim_bloco := t + (cfg.duracao_min || ' minutes')::interval;
          BEGIN
            INSERT INTO public.slots(profissional_id, unidade_id, data, hora_inicio, hora_fim, agenda_config_id)
            VALUES (cfg.profissional_id, cfg.unidade_id, d, t, fim_bloco, cfg.id);
            count_inserted := count_inserted + 1;
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
          t := fim_bloco;
        END LOOP;
      END IF;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN count_inserted;
END;
$$;

-- ============ RLS POLICIES ============
-- profiles: usuário vê o próprio; admin vê tudo
CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- user_roles: cada um vê seus papéis; admin gerencia
CREATE POLICY "roles_select_self" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- unidades: staff lê; admin escreve
CREATE POLICY "unidades_select_staff" ON public.unidades FOR SELECT TO authenticated USING (public.is_authenticated_staff(auth.uid()));
CREATE POLICY "unidades_admin_all" ON public.unidades FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- especialidades
CREATE POLICY "esp_select_staff" ON public.especialidades FOR SELECT TO authenticated USING (public.is_authenticated_staff(auth.uid()));
CREATE POLICY "esp_admin_all" ON public.especialidades FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- profissionais
CREATE POLICY "prof_select_staff" ON public.profissionais FOR SELECT TO authenticated USING (public.is_authenticated_staff(auth.uid()));
CREATE POLICY "prof_admin_all" ON public.profissionais FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- pacientes (staff CRUD)
CREATE POLICY "pac_staff_all" ON public.pacientes FOR ALL TO authenticated USING (public.is_authenticated_staff(auth.uid())) WITH CHECK (public.is_authenticated_staff(auth.uid()));

-- agendas_config (staff CRUD)
CREATE POLICY "agcfg_staff_all" ON public.agendas_config FOR ALL TO authenticated USING (public.is_authenticated_staff(auth.uid())) WITH CHECK (public.is_authenticated_staff(auth.uid()));

-- slots (staff CRUD)
CREATE POLICY "slots_staff_all" ON public.slots FOR ALL TO authenticated USING (public.is_authenticated_staff(auth.uid())) WITH CHECK (public.is_authenticated_staff(auth.uid()));

-- agendamentos (staff CRUD)
CREATE POLICY "ag_staff_all" ON public.agendamentos FOR ALL TO authenticated USING (public.is_authenticated_staff(auth.uid())) WITH CHECK (public.is_authenticated_staff(auth.uid()));
