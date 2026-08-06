# Prompt: Implementar Fila de Espera + Regulação + Cotas por Unidade

Use este prompt como instrução completa para replicar, em outro projeto Lovable, o módulo de **Fila de Espera**, **Regulação Municipal** e **Cotas de Agendamento** do SpokenMed.

---

## 1. Visão geral do fluxo

```text
Sistema legado (.exe) ──POST /api/public/ingest──┐
                                                 ▼
Recepção/Triagem ──► Fila de Espera ──► Regulação ──► Agendamento ──► Cota
                          │                                    │
                          └────────────── UBS local ───────────┘
```

- **Fila de Espera**: pacientes aguardam vaga em uma UBS, ordenados por classificação de risco SUS, urgência e data de entrada.
- **Regulação**: guias/encaminhamentos vindos do sistema legado são listados para a central de regulação decidir para qual unidade/hospital encaminhar.
- **Cotas**: cada UBS pode operar no regime **livre** (sem limite) ou **por cota** (limite mensal por especialidade/procedimento). A Secretaria de Saúde tem uma cota extra para urgências.

---

## 2. Banco de dados — migrations obrigatórias

### 2.1 Regime da unidade e origem do agendamento

```sql
ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS regime_agendamento text NOT NULL DEFAULT 'livre'
    CHECK (regime_agendamento IN ('livre','cota'));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='agendamentos' AND column_name='origem_agenda'
  ) THEN
    ALTER TABLE public.agendamentos
      ADD COLUMN origem_agenda text NOT NULL DEFAULT 'ubs'
      CHECK (origem_agenda IN ('ubs','secretaria'));
  END IF;
END $$;
```

### 2.2 Cotas por especialidade

```sql
ALTER TABLE public.cotas_especialidade
  ADD COLUMN IF NOT EXISTS vagas_secretaria integer NOT NULL DEFAULT 0
    CHECK (vagas_secretaria >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cotas_esp_unid_esp_comp
  ON public.cotas_especialidade (unidade_id, especialidade_id, competencia);
```

### 2.3 Cotas por procedimento (SIGTAP)

```sql
CREATE TABLE IF NOT EXISTS public.cotas_procedimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  vagas_totais integer NOT NULL DEFAULT 0 CHECK (vagas_totais >= 0),
  vagas_secretaria integer NOT NULL DEFAULT 0 CHECK (vagas_secretaria >= 0),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, procedimento_id, competencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotas_procedimento TO authenticated;
GRANT ALL ON public.cotas_procedimento TO service_role;

ALTER TABLE public.cotas_procedimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cotas_proc_read" ON public.cotas_procedimento
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cotas_proc_write" ON public.cotas_procedimento
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)
      OR private.has_permission(auth.uid(),'cotas','manage'))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role)
      OR private.has_permission(auth.uid(),'cotas','manage'));
```

### 2.4 Fila de espera

```sql
CREATE TABLE IF NOT EXISTS public.fila_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid REFERENCES public.pacientes(id) ON DELETE SET NULL,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  especialidade_id uuid REFERENCES public.especialidades(id) ON DELETE SET NULL,
  procedimento_id uuid REFERENCES public.procedimentos(id) ON DELETE SET NULL,
  classificacao_risco text CHECK (classificacao_risco IN ('vermelho','laranja','amarelo','verde','azul')),
  urgencia text NOT NULL DEFAULT 'normal' CHECK (urgencia IN ('normal','prioritaria','urgente')),
  cid10 text,
  solicitante_nome text,
  solicitante_cns text,
  solicitante_cbo text,
  solicitante_cnes text,
  observacoes text,
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','agendado','cancelado')),
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fila_espera TO authenticated;
GRANT ALL ON public.fila_espera TO service_role;

ALTER TABLE public.fila_espera ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fila_read" ON public.fila_espera
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "fila_write" ON public.fila_espera
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)
      OR private.has_permission(auth.uid(),'fila','manage'))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role)
      OR private.has_permission(auth.uid(),'fila','manage'));
```

### 2.5 TME customizável (Tempo Máximo de Espera)

```sql
CREATE TABLE IF NOT EXISTS public.tme_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE CASCADE,
  especialidade_id uuid REFERENCES public.especialidades(id) ON DELETE CASCADE,
  classificacao_risco text NOT NULL CHECK (classificacao_risco IN ('vermelho','laranja','amarelo','verde','azul')),
  tme_dias integer NOT NULL CHECK (tme_dias > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, especialidade_id, classificacao_risco)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tme_config TO authenticated;
GRANT ALL ON public.tme_config TO service_role;

ALTER TABLE public.tme_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tme_read" ON public.tme_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "tme_write" ON public.tme_config
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role)
      OR private.has_permission(auth.uid(),'cotas','manage'))
  WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role)
      OR private.has_permission(auth.uid(),'cotas','manage'));
```

### 2.6 Integração / Regulação (receber dados do sistema legado)

```sql
CREATE TABLE IF NOT EXISTS public.integracao_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL,
  tabela text NOT NULL,
  total_registros integer NOT NULL DEFAULT 0,
  total_inseridos integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'processando' CHECK (status IN ('processando','recebido','erro')),
  erro_msg text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integracao_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.integracao_lotes(id) ON DELETE CASCADE,
  origem text NOT NULL,
  tabela text NOT NULL,
  chave_origem text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integracao_lotes TO authenticated;
GRANT ALL ON public.integracao_lotes TO service_role;
ALTER TABLE public.integracao_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lotes_read" ON public.integracao_lotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "lotes_write" ON public.integracao_lotes FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'regulacao','manage')) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'regulacao','manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integracao_registros TO authenticated;
GRANT ALL ON public.integracao_registros TO service_role;
ALTER TABLE public.integracao_registros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "registros_read" ON public.integracao_registros FOR SELECT TO authenticated USING (true);
CREATE POLICY "registros_write" ON public.integracao_registros FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'regulacao','manage')) WITH CHECK (private.has_role(auth.uid(),'admin'::public.app_role) OR private.has_permission(auth.uid(),'regulacao','manage'));
```

### 2.7 Funções de controle de cota

```sql
CREATE OR REPLACE FUNCTION public.consumo_cota(
  _unidade_id uuid,
  _especialidade_id uuid,
  _procedimento_id uuid,
  _competencia date
) RETURNS TABLE (
  regime text,
  esp_totais int, esp_secretaria int, esp_usadas_ubs int, esp_usadas_sec int,
  proc_totais int, proc_secretaria int, proc_usadas_ubs int, proc_usadas_sec int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_comp date := date_trunc('month', COALESCE(_competencia, current_date))::date;
  v_next date := (v_comp + interval '1 month')::date;
BEGIN
  SELECT u.regime_agendamento INTO regime FROM public.unidades u WHERE u.id = _unidade_id;
  regime := COALESCE(regime, 'livre');

  IF _especialidade_id IS NOT NULL THEN
    SELECT COALESCE(c.vagas_totais,0), COALESCE(c.vagas_secretaria,0)
      INTO esp_totais, esp_secretaria
      FROM public.cotas_especialidade c
     WHERE c.unidade_id = _unidade_id AND c.especialidade_id = _especialidade_id
       AND c.competencia = v_comp
     LIMIT 1;

    SELECT
      count(*) FILTER (WHERE a.origem_agenda = 'ubs'),
      count(*) FILTER (WHERE a.origem_agenda = 'secretaria')
      INTO esp_usadas_ubs, esp_usadas_sec
      FROM public.agendamentos a
      JOIN public.profissionais p ON p.id = a.profissional_id
     WHERE a.unidade_id = _unidade_id
       AND a.status IN ('agendado','confirmado','atendido')
       AND a.data >= v_comp AND a.data < v_next
       AND p.especialidade_id = _especialidade_id;
  END IF;

  IF _procedimento_id IS NOT NULL THEN
    SELECT COALESCE(c.vagas_totais,0), COALESCE(c.vagas_secretaria,0)
      INTO proc_totais, proc_secretaria
      FROM public.cotas_procedimento c
     WHERE c.unidade_id = _unidade_id AND c.procedimento_id = _procedimento_id
       AND c.competencia = v_comp
     LIMIT 1;

    SELECT
      count(*) FILTER (WHERE a.origem_agenda = 'ubs'),
      count(*) FILTER (WHERE a.origem_agenda = 'secretaria')
      INTO proc_usadas_ubs, proc_usadas_sec
      FROM public.agendamentos a
     WHERE a.unidade_id = _unidade_id
       AND a.status IN ('agendado','confirmado','atendido')
       AND a.data >= v_comp AND a.data < v_next
       AND a.procedimento_id = _procedimento_id;
  END IF;

  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.consumo_cota(uuid,uuid,uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_ag_valida_cota()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_regime text;
  v_esp uuid;
  v_comp date := date_trunc('month', NEW.data)::date;
  v_next date := (v_comp + interval '1 month')::date;
  v_esp_tot int; v_esp_sec int; v_esp_ubs_usadas int; v_esp_sec_usadas int;
  v_proc_tot int; v_proc_sec int; v_proc_ubs_usadas int; v_proc_sec_usadas int;
  v_has_proc_cota boolean := false;
BEGIN
  IF NEW.is_encaixe IS TRUE THEN RETURN NEW; END IF;

  SELECT regime_agendamento INTO v_regime FROM public.unidades WHERE id = NEW.unidade_id;
  IF COALESCE(v_regime,'livre') = 'livre' THEN RETURN NEW; END IF;

  SELECT especialidade_id INTO v_esp FROM public.profissionais WHERE id = NEW.profissional_id;

  IF v_esp IS NOT NULL THEN
    SELECT COALESCE(vagas_totais,0), COALESCE(vagas_secretaria,0)
      INTO v_esp_tot, v_esp_sec
      FROM public.cotas_especialidade
     WHERE unidade_id = NEW.unidade_id AND especialidade_id = v_esp AND competencia = v_comp
     LIMIT 1;

    SELECT
      count(*) FILTER (WHERE origem_agenda = 'ubs'),
      count(*) FILTER (WHERE origem_agenda = 'secretaria')
      INTO v_esp_ubs_usadas, v_esp_sec_usadas
      FROM public.agendamentos a
      JOIN public.profissionais p ON p.id = a.profissional_id
     WHERE a.unidade_id = NEW.unidade_id
       AND a.status IN ('agendado','confirmado','atendido')
       AND a.data >= v_comp AND a.data < v_next
       AND p.especialidade_id = v_esp;

    IF NEW.origem_agenda = 'secretaria' THEN
      IF v_esp_sec_usadas >= v_esp_sec THEN
        RAISE EXCEPTION 'cota_esgotada_secretaria_esp' USING ERRCODE = 'P0050';
      END IF;
    ELSE
      IF v_esp_ubs_usadas >= v_esp_tot THEN
        RAISE EXCEPTION 'cota_esgotada_ubs_esp' USING ERRCODE = 'P0051';
      END IF;
    END IF;
  END IF;

  IF NEW.procedimento_id IS NOT NULL THEN
    SELECT true, COALESCE(vagas_totais,0), COALESCE(vagas_secretaria,0)
      INTO v_has_proc_cota, v_proc_tot, v_proc_sec
      FROM public.cotas_procedimento
     WHERE unidade_id = NEW.unidade_id AND procedimento_id = NEW.procedimento_id AND competencia = v_comp
     LIMIT 1;

    IF v_has_proc_cota THEN
      SELECT
        count(*) FILTER (WHERE origem_agenda = 'ubs'),
        count(*) FILTER (WHERE origem_agenda = 'secretaria')
        INTO v_proc_ubs_usadas, v_proc_sec_usadas
        FROM public.agendamentos
       WHERE unidade_id = NEW.unidade_id
         AND status IN ('agendado','confirmado','atendido')
         AND data >= v_comp AND data < v_next
         AND procedimento_id = NEW.procedimento_id;

      IF NEW.origem_agenda = 'secretaria' THEN
        IF v_proc_sec_usadas >= v_proc_sec THEN
          RAISE EXCEPTION 'cota_esgotada_secretaria_proc' USING ERRCODE = 'P0052';
        END IF;
      ELSE
        IF v_proc_ubs_usadas >= v_proc_tot THEN
          RAISE EXCEPTION 'cota_esgotada_ubs_proc' USING ERRCODE = 'P0053';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ag_valida_cota ON public.agendamentos;
CREATE TRIGGER trg_ag_valida_cota
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_ag_valida_cota();
```

---

## 3. Permissões

Adicione estes módulos no arquivo de permissões do projeto (`src/lib/permissions.ts`):

```typescript
export type ModuleKey =
  | "agenda_dia"
  | "agendar"
  | "fila"
  | "regulacao"
  | "cotas"
  | "secretaria_agendar"
  | /* ... outros módulos existentes ... */;

export const MODULES: { key: ModuleKey; label: string; manageable: boolean }[] = [
  { key: "agenda_dia", label: "Agenda do dia", manageable: true },
  { key: "agendar", label: "Agendar consulta", manageable: true },
  { key: "fila", label: "Fila de Espera", manageable: true },
  { key: "regulacao", label: "Encaminhamentos / Regulação", manageable: true },
  { key: "cotas", label: "Cotas de agendamento", manageable: true },
  { key: "secretaria_agendar", label: "Agendar como Secretaria (urgência)", manageable: true },
  // ...
];

export const defaultPermsFor = (role: AppRole): PermRow[] => {
  // admin vê e gerencia tudo
  if (role === "admin") return MODULES.map((m) => ({ module: m.key, can_view: true, can_manage: true }));

  // recepcionista: agenda, fila, pacientes, painel, recepção
  if (role === "recepcionista") {
    return MODULES.map((m) => {
      if (["agenda_dia","agendar","fila","pacientes","painel","recepcao"].includes(m.key)) {
        return { module: m.key, can_view: true, can_manage: true };
      }
      if (["profissionais","agendas"].includes(m.key)) {
        return { module: m.key, can_view: true, can_manage: false };
      }
      return { module: m.key, can_view: false, can_manage: false };
    });
  }

  // triagem: triagem, fila, recepção, pacientes, agenda do dia (só ver)
  if (role === "triagem") {
    return MODULES.map((m) => {
      if (["triagem","fila","recepcao","pacientes"].includes(m.key)) {
        return { module: m.key, can_view: true, can_manage: true };
      }
      if (["agenda_dia","painel"].includes(m.key)) {
        return { module: m.key, can_view: true, can_manage: false };
      }
      return { module: m.key, can_view: false, can_manage: false };
    });
  }

  // médico: agenda do dia, pacientes, recepção, assinaturas
  if (role === "medico") {
    return MODULES.map((m) => ({
      module: m.key,
      can_view: ["agenda_dia","pacientes","recepcao","assinaturas"].includes(m.key),
      can_manage: m.key === "assinaturas",
    }));
  }

  // ACS: visitas, domicílios, pacientes
  if (role === "acs") {
    return MODULES.map((m) => {
      if (["visitas","domicilios","pacientes"].includes(m.key)) {
        return { module: m.key, can_view: true, can_manage: true };
      }
      return { module: m.key, can_view: false, can_manage: false };
    });
  }

  return MODULES.map((m) => ({ module: m.key, can_view: false, can_manage: false }));
};
```

A função `can(module, action)` deve retornar `true` para `admin` automaticamente; para os demais, usar `user_permissions` ou fallback por role.

---

## 4. Telas obrigatórias

### 4.1 Fila de Espera (`/app/fila`)

**Layout:**
- Filtros: unidade, especialidade, status (`aguardando` | `agendado` | `todos`), busca por nome/CPF.
- Botão "Adicionar à fila" abre modal com: paciente (busca), especialidade, procedimento, classificação de risco, urgência, solicitante (nome/CNS/CBO/CNES), observações.
- Lista ordenada por: status `aguardando` primeiro → risco (vermelho < laranja < amarelo < verde < azul) → urgência → `created_at`.
- Cada item mostra: posição na fila, nome, idade, CNS, especialidade, classificação de risco, urgência, dias na fila, alerta se ultrapassar o TME.
- Ações no menu: alterar urgência, agendar (abre tela de agendamento pré-preenchendo paciente/especialidade/procedimento), remover da fila (soft-delete com motivo).

**Regras:**
- Só permite adicionar se o usuário tiver `fila:manage` e uma unidade vinculada.
- Remoção grava motivo nas observações e muda status para `cancelado`.
- Ao agendar a partir da fila, preencher `fila_espera.agendamento_id` e mudar status para `agendado`.

**Realtime:** inscrever canal Supabase `postgres_changes` na tabela `fila_espera` e refazer a query a cada 2s como fallback.

### 4.2 Regulação / Encaminhamentos (`/app/encaminhamentos`)

**Layout:**
- Cards resumo: total de guias, após filtros, especialidades, unidades solicitantes.
- Filtros: busca textual, especialidade, unidade, tipo de encaminhamento.
- Tabela: guia, paciente, idade, especialidade/serviço, unidade, profissional solicitante, status, prioridade, data.
- Botão "Ver detalhes" abre modal com todos os campos do payload.
- Botão "Exportar CSV" gera arquivo com todos os campos visíveis/filtrados.

**Dados:** leem de `integracao_registros` onde `tabela ILIKE 'ENCAMINHAMENTO'`, ordenado por `created_at DESC`, paginado.

**Realtime:** canal Supabase + refetch a cada 2s.

### 4.3 Cotas (`/app/configuracoes/cotas` ou `/app/cotas`)

**Abas:**
1. **Regime por UBS**: tabela com switch "Por cota" por unidade.
2. **Cotas mensais**: seletor de UBS + competência (mês).
   - Tabela de especialidades: colunas "Vagas UBS" e "Vagas Secretaria".
   - Tabela de procedimentos SIGTAP: colunas "Vagas UBS" e "Vagas Secretaria".
   - Botões "Salvar" e "Copiar mês anterior".

**Regras:**
- Só admin ou quem tem `cotas:manage` acessa.
- Competência sempre salva como dia 1 do mês.
- Procedimento sem cota cadastrada não é limitado (regime livre para aquele procedimento).

### 4.4 Agendar (`/app/agendar`)

**Campos:**
- Unidade, especialidade, profissional, data.
- Lista de slots livres do profissional na data.
- Paciente (busca por nome/CPF/CNS).
- Procedimento (opcional).
- Motivo/observação.
- Toggle "Agendar como Secretaria (urgência)" — visível apenas para quem tem `secretaria_agendar:manage`.

**Badge de cota:**
- Chamar `consumo_cota(unidade, especialidade, procedimento, competencia)`.
- Se regime = `livre`, mostrar "Agendamento livre".
- Se regime = `cota`, mostrar: "UBS: X/Y usadas · Secretaria: Z/W usadas".
- Desabilitar confirmação se a cota estiver esgotada (o banco também bloqueia via trigger).

**Mensagens de erro amigáveis:**
- `cota_esgotada_ubs_esp` → "Cota da UBS para esta especialidade esgotada neste mês."
- `cota_esgotada_secretaria_esp` → "Cota da Secretaria para esta especialidade esgotada."
- `cota_esgotada_ubs_proc` → "Cota da UBS para este procedimento esgotada."
- `cota_esgotada_secretaria_proc` → "Cota da Secretaria para este procedimento esgotada."

---

## 5. API de ingestão (`/api/public/ingest`)

Criar uma rota pública do TanStack Start em `src/routes/api/public/ingest.ts`.

**Requisitos:**
- Aceitar apenas `POST` e `OPTIONS`.
- Validar header `x-api-key` contra uma variável de ambiente `INGEST_API_KEY`.
- CORS liberado para origem `*`.
- Body JSON com schema:

```typescript
const bodySchema = z.object({
  origem: z.string().trim().min(1).max(60).default("firebird"),
  tabela: z.string().trim().min(1).max(120),
  chave_primaria: z.union([z.string().max(120), z.array(z.string().max(120))]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  registros: z.array(z.record(z.string(), z.unknown())).min(1).max(10000),
});
```

**Comportamento:**
1. Criar um lote em `integracao_lotes`.
2. Para cada registro, extrair a chave primária (case-insensitive) e inserir em `integracao_registros`.
3. Registros com chave fazem `upsert` por `(origem, tabela, chave_origem)`.
4. Registros sem chave são inseridos novos.
5. Se `tabela` for `LEITO`, `INTERNACAO` ou `INTER_EVOLUCAO`, chamar RPC `materializar_integracao_hospitalar(p_lote_id)`.
6. Se `tabela` for `OBSERVACAO` ou `FICHAATENDIMENTO_EVOLUCAO`, chamar RPC `materializar_integracao_observacao(p_lote_id)`.
7. Retornar JSON: `{ ok, lote_id, tabela, recebidos, gravados, materializados }`.

**Exemplo de payload para ENCAMINHAMENTO:**

```json
{
  "origem": "firebird",
  "tabela": "ENCAMINHAMENTO",
  "chave_primaria": "ID_GUIA_ENCA",
  "metadata": { "unidade_origem": "UBS Central" },
  "registros": [
    {
      "ID_GUIA_ENCA": 12345,
      "PACIENTE_NOME": "Maria Silva",
      "PACIENTE_DATANASCIMENTO": "1985-03-10",
      "PACIENTE_CARTAO": "123456789012345",
      "PACIENTE_SEXO": "F",
      "ESPECIALIDADE_NOME": "Cardiologia",
      "SERVICO_DESCRICAO": "Consulta eletiva",
      "UNIDADE_NOME": "UBS Boa Vista",
      "MEDICO_NOME": "Dr. João",
      "STATUS_DESCRICAO": "Pendente",
      "VAGA_PRIORIDADE": "Prioridade",
      "DT_GUIA_ENCA": "2026-08-06"
    }
  ]
}
```

---

## 6. Checklist de implementação

- [ ] Criar tabelas/migrations acima no backend.
- [ ] Configurar `INGEST_API_KEY` no ambiente do projeto.
- [ ] Criar/ajustar `src/lib/permissions.ts` com os módulos `fila`, `regulacao`, `cotas`, `secretaria_agendar`.
- [ ] Criar hook `useAllowedUnidades()` que retorna unidades do admin (todas) ou vinculadas ao usuário.
- [ ] Criar tela `/app/fila` com filtros, modal de adição, ordenação por risco/urgência e ações.
- [ ] Criar tela `/app/encaminhamentos` consumindo `integracao_registros`.
- [ ] Criar tela `/app/configuracoes/cotas` com regime por UBS e cotas mensais.
- [ ] Ajustar tela `/app/agendar` para consultar `consumo_cota()` e respeitar `origem_agenda`.
- [ ] Adicionar itens no menu lateral (`app-sidebar.tsx`) para Fila, Regulação e Cotas.
- [ ] Testar: colocar paciente na fila, agendar a partir da fila, enviar guia via `/api/public/ingest`, configurar cota e tentar exceder.

---

## 7. Dicas importantes

- **Encaixe (overbooking)** pode continuar existindo, mas deve bypassar a cota (`is_encaixe = true` → trigger retorna sem validar).
- **Cota da Secretaria** é independente da cota UBS. Mesmo que a UBS esgote suas vagas, a Secretaria ainda pode agendar se tiver vagas extras.
- **TME default** por classificação de risco: vermelho=1 dia, laranja=7, amarelo=30, verde=90, azul=180.
- **Classificação de risco** segue o protocolo Manchester: vermelho > laranja > amarelo > verde > azul.
- **Integração** é sempre "dados brutos" em `integracao_registros`; se quiser transformar em pacientes/agendamentos reais, crie funções de materialização separadas.
