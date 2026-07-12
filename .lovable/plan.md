## Objetivo

Permitir que o admin configure, para cada UBS, se ela agenda **livre** ou **sob cota mensal**, definindo vagas por especialidade e por procedimento (SIGTAP), com uma **cota extra fixa** exclusiva da Secretaria de Saúde para urgências.

## Modelo de dados

Já existe a tabela `cotas_especialidade (unidade_id, especialidade_id, competencia, vagas_totais)`. Vamos aproveitar e complementar.

### 1. `unidades` — modo de agendamento
Adicionar coluna:
- `regime_agendamento text NOT NULL DEFAULT 'livre'` — valores: `'livre'` ou `'cota'`.

Quando `livre`, a UBS agenda à vontade. Quando `cota`, aplicam-se os limites configurados.

### 2. `cotas_especialidade` — ajustes
- Adicionar `vagas_secretaria int NOT NULL DEFAULT 0` (cota extra fixa da Secretaria, além de `vagas_totais`).
- Garantir UNIQUE `(unidade_id, especialidade_id, competencia)`.
- Normalizar `competencia` para o 1º dia do mês (já existe trigger `fn_cotas_normaliza_competencia`).

### 3. `cotas_procedimento` — nova tabela (mesma ideia, mas para exames/SIGTAP)
```
id, unidade_id, procedimento_id, competencia (date, 1º do mês),
vagas_totais int, vagas_secretaria int DEFAULT 0,
observacoes, created_at, updated_at
UNIQUE (unidade_id, procedimento_id, competencia)
```
+ GRANTs, RLS (admin/gestor gerenciam; recepção/triagem leem) e trigger de normalização.

### 4. `agendamentos` — marcar origem
Adicionar:
- `origem_agenda text NOT NULL DEFAULT 'ubs'` — valores: `'ubs'` ou `'secretaria'`.
- (Reusa `is_encaixe` para casos fora de cota; a Secretaria consome primeiro a cota dela.)

### 5. Função `consumo_cota(unidade, especialidade|procedimento, competencia)`
Security definer, retorna:
```
{ usadas_ubs, usadas_secretaria, disponiveis_ubs, disponiveis_secretaria, regime }
```
Conta agendamentos ativos (`status in ('agendado','confirmado','atendido')`) no mês da competência.

### 6. Enforcement — trigger `fn_ag_valida_cota` BEFORE INSERT em `agendamentos`
Lógica:
1. Se `unidades.regime_agendamento = 'livre'` → passa.
2. Se `origem_agenda = 'secretaria'`:
   - Consome `vagas_secretaria`; se esgotada, cai em `vagas_totais`; se as duas esgotadas → erro `cota_esgotada_secretaria`.
3. Se `origem_agenda = 'ubs'`:
   - Consome `vagas_totais`; se esgotada → erro `cota_esgotada_ubs`.
4. Busca cota por `especialidade_id` do profissional; se houver `procedimento_id`, valida também a cota do procedimento (a mais restritiva vence).
5. `is_encaixe = true` bypassa cota mas grava aviso no `agendamento_historico`.

Erros retornados amigáveis no front (`app.agendar.tsx` já trata `slot_indisponivel` etc.).

## UI

### A. Configurações → aba **Cotas**
Nova rota `src/routes/app.configuracoes.cotas.tsx` (admin/gestor).

Duas abas internas:
1. **Por UBS** — lista unidades com switch `Livre / Por cota` (atualiza `unidades.regime_agendamento`).
2. **Cotas mensais** — filtro por UBS + competência (mês/ano). Duas tabelas:
   - Especialidades: linhas com `vagas_totais`, `vagas_secretaria`, botão salvar.
   - Procedimentos (SIGTAP): idem.
   - Botão "Copiar do mês anterior".

### B. Tela de agendar (`app.agendar.tsx`)
- Mostrar badge da cota ao escolher especialidade/procedimento na unidade (ex.: `Cotas: 12/30 UBS · 0/5 Secretaria`).
- Se usuário tem permissão `secretaria.agendar` (nova permissão), aparece toggle **"Agendar como Secretaria (urgência)"** que envia `origem_agenda='secretaria'`.
- Bloquear botão confirmar quando cota UBS esgotada e usuário não é Secretaria.

### C. Painel/relatórios
- Card em `app.relatorios.tsx` com consumo do mês por UBS × especialidade (barra de progresso).

## Permissões
- Novo módulo `cotas` (view/manage) em `src/lib/permissions.ts` — admin e gestor gerenciam; demais só veem consumo.
- Nova permissão `secretaria.agendar` (manage) — quem pode agendar consumindo cota da Secretaria/bypass. Concedida por padrão a `admin` e a um novo perfil informal (atribuída manualmente ao usuário da Secretaria).

## Migrations (nesta ordem, em uma migration)
1. `ALTER TABLE unidades ADD COLUMN regime_agendamento`.
2. `ALTER TABLE cotas_especialidade ADD COLUMN vagas_secretaria` + UNIQUE index.
3. `CREATE TABLE cotas_procedimento` + GRANTs + RLS + policies + trigger de normalização.
4. `ALTER TABLE agendamentos ADD COLUMN origem_agenda`.
5. `CREATE FUNCTION public.consumo_cota(...)` e `public.fn_ag_valida_cota()`.
6. `CREATE TRIGGER trg_ag_valida_cota BEFORE INSERT ON agendamentos` (roda depois do `fn_ag_reserva_slot`).

## Arquivos a criar/alterar
- Migration nova.
- `src/routes/app.configuracoes.cotas.tsx` (nova).
- `src/routes/app.configuracoes.tsx` — adicionar link/aba "Cotas".
- `src/routes/app.agendar.tsx` — badge de cota + toggle Secretaria + tratamento dos erros novos.
- `src/lib/permissions.ts` — módulo `cotas` e permissão `secretaria.agendar`.
- `src/routes/app.relatorios.tsx` — card de consumo (opcional nesta 1ª entrega).

## Fora de escopo
- Divisão automática de cota global entre UBSs (você escolheu cota por UBS).
- Renovação semanal/diária (fica só mensal).
- Fila de espera priorizada por cota estourada (pode vir depois).
