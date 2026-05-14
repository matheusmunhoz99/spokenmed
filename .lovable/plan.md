## SpokenMed — Sistema de Agendamento Médico Municipal

Sistema completo para Secretaria de Saúde gerenciar agendamentos. Direção visual escolhida: **Civic Clarity** (paleta teal/slate institucional, alta legibilidade).

## Stack
- TanStack Start + React + Tailwind v4 (tokens semânticos em `src/styles.css`)
- Lovable Cloud (Postgres + Auth + RLS) — será ativado
- shadcn/ui, lucide-react, date-fns, react-day-picker, zod

## Perfis e acesso
- **Admin (Secretaria)**: tudo — cadastros, parametrização, relatórios
- **Recepcionista**: cadastra paciente, agenda, remarca, cancela, faz check-in
- Login email+senha; roles em tabela separada `user_roles` + função `has_role` (sem recursão RLS)

## Modelo de dados (Cloud)
- `profiles` — usuários do sistema (nome, cargo)
- `user_roles` — admin | recepcionista
- `unidades` — unidades de saúde (UBS/postos)
- `especialidades`
- `profissionais` — médicos/profissionais (CRM/conselho, especialidade, unidade, contato)
- `pacientes` — cadastro completo: nome, CPF, CNS (cartão SUS), RG, nascimento, sexo, telefone, email, endereço completo (CEP/logradouro/nº/bairro/cidade/UF), nome da mãe, observações
- `agendas_config` — por profissional: dias da semana, hora início/fim manhã, hora início/fim tarde, duração do slot (min), unidade, vigência (data início/fim)
- `slots` — vagas geradas (profissional, data, hora_inicio, hora_fim, status: livre/reservado/bloqueado)
- `agendamentos` — slot_id, paciente_id, status (agendado/confirmado/atendido/faltou/cancelado), motivo, observações, criado_por, criado_em
- RLS em todas as tabelas; admin total, recepcionista CRUD operacional

## Fluxo de parametrização (regra crítica do cliente)
1. Cadastrar profissional
2. Abrir **Agenda do Profissional** → definir: dias da semana, blocos (manhã/tarde), hora início/fim, intervalo do slot (15/20/30/40/60 min), período de vigência
3. Sistema **gera as vagas** (`slots`) automaticamente para o período
4. Só depois disso o agendamento fica disponível para aquele profissional

## Telas
- **Login**
- **Dashboard**: KPIs (agendamentos hoje, taxa de absenteísmo da semana, vagas livres, total de pacientes), próximos agendamentos, agenda resumida
- **Pacientes**: lista com busca (nome/CPF/CNS), cadastro/edição com validação zod, histórico de consultas
- **Profissionais**: lista, cadastro/edição, link "Abrir Agenda"
- **Agenda do Profissional (parametrização)**: form de configuração + preview de vagas geradas + botão "Publicar agenda"
- **Agendar Consulta**: seleciona unidade → especialidade → profissional → data (calendário com dias disponíveis) → horário (grid de slots livres) → paciente (busca/cadastro rápido) → confirmação
- **Agenda do Dia (visão profissional/recepção)**: timeline do dia, status de cada consulta, ações (confirmar/check-in/atender/faltou/cancelar)
- **Configurações**: unidades, especialidades, usuários do sistema

## Design — Civic Clarity
- Paleta: slate-50 fundo, teal-700 primary, teal-600 hover, slate-900 texto, accents em emerald (sucesso) / amber (atenção) / red-600 (cancelado)
- Tokens em `src/styles.css` (oklch), tudo via classes semânticas
- Layout com sidebar fixa (nav do app) + topbar com unidade ativa e usuário
- Tipografia limpa (Inter), cantos sutis (radius 8px), sombras discretas, foco em legibilidade

## Entrega faseada
**Fase 1 (este turno):**
- Ativar Lovable Cloud
- Criar schema completo + RLS + roles + trigger de profile
- Design system (tokens) + shell (sidebar/topbar) + login + dashboard
- CRUD Pacientes e Profissionais
- Configuração de Agenda + geração de slots
- Fluxo de Agendamento
- Agenda do Dia

**Fase 2 (próximos turnos, conforme uso):**
- Relatórios (absenteísmo, produção por profissional)
- Bloqueio de horário/feriados
- Notificações por email (lembrete)
- Importação em massa de pacientes

## Pergunta antes de codar
Vou criar o **primeiro admin** com seed manual depois do signup. Confirma que posso seguir já com a Fase 1 completa?
