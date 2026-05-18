
# Teleconsulta — SpokenMED

Adiciona modalidade **teleconsulta** ao agendamento, usando Daily.co para o vídeo, com acesso do paciente por link único e/ou painel do cidadão, gravação com consentimento, avaliação NPS, resumo do médico e download dos documentos emitidos.

## 1. Modelo de dados (migration)

```text
agendamentos
  + modalidade text default 'presencial' check (in ('presencial','teleconsulta'))
  + tele_sala_id uuid references teleconsulta_salas(id)

teleconsulta_salas
  id uuid pk
  agendamento_id uuid unique → agendamentos
  daily_room_name text unique
  daily_room_url text
  token_paciente text unique         -- usado em /tele/{token}
  consentimento_gravacao boolean default false
  consentimento_em timestamptz
  gravar boolean default false
  recording_id text                  -- id Daily da gravação
  recording_url text                 -- link expirável armazenado
  iniciada_em timestamptz
  encerrada_em timestamptz
  duracao_seg int
  status text default 'agendada'     -- agendada|em_andamento|encerrada|cancelada
  created_at, updated_at

teleconsulta_avaliacoes
  id, sala_id unique → teleconsulta_salas
  nota int check (1..5)
  nps int check (0..10)
  comentario text
  audio_ok, video_ok boolean
  created_at

teleconsulta_resumos
  id, agendamento_id unique → agendamentos
  resumo_paciente text               -- visível ao paciente
  notas_internas text                -- só médico/admin
  publicado boolean default false
  publicado_em timestamptz
  created_at, updated_at
```

**RLS:**
- `teleconsulta_salas`: admin total; médico do agendamento RW; staff da unidade SELECT; **acesso público** via RPC `tele_paciente_entrar(p_token)` (security definer) — não há policy aberta na tabela.
- `teleconsulta_avaliacoes`: insert público via RPC `tele_avaliar(p_token,...)`; SELECT pelo staff da unidade.
- `teleconsulta_resumos`: RW pelo médico; SELECT staff; leitura pública filtrada por `publicado=true` via RPC `cidadao_consultar` estendida.

## 2. Backend — server functions (`src/lib/tele.functions.ts`)

| Função | Quem | O que faz |
|---|---|---|
| `criarSalaTele({agendamento_id})` | médico/recep autenticado | cria room no Daily (`POST /rooms`), gera `token_paciente` (32 bytes hex), grava em `teleconsulta_salas`, marca `agendamentos.modalidade='teleconsulta'`. |
| `gerarTokenMedico({sala_id})` | médico do agendamento | retorna meeting token Daily com `is_owner:true`, expira em 2h. |
| `iniciarGravacao({sala_id})` | médico | exige `consentimento_gravacao=true`; chama Daily `start-recording`; salva `recording_id`. |
| `pararGravacao({sala_id})` | médico | `stop-recording`, atualiza `encerrada_em`, busca download link e persiste em `recording_url`. |
| `salvarResumo({agendamento_id, resumo_paciente, notas_internas, publicar})` | médico | upsert em `teleconsulta_resumos`. |

`DAILY_API_KEY` lida via `process.env` dentro do handler. Todas com `requireSupabaseAuth`.

**RPCs públicas (security definer, sem auth):**
- `tele_paciente_entrar(p_token)` → valida token, devolve `{room_url, meeting_token (não-owner, 1h), nome_paciente, consentimento_pendente, sala_id}`. Marca `status='em_andamento'` e `iniciada_em` na primeira chamada.
- `tele_aceitar_gravacao(p_token)` → seta `consentimento_gravacao=true`.
- `tele_avaliar(p_token, nota, nps, comentario, audio_ok, video_ok)` → insert em `teleconsulta_avaliacoes`.
- `cidadao_consultar_documentos(p_cpf, p_data_nasc)` → lista agendamentos teleconsulta encerrados nas últimas 72h + documentos emitidos vinculados + resumo publicado. Usa CPF+DN (não código).

## 3. Frontend

### 3.1 Médico — `app.atendimento.$agendamentoId.tsx` (nova)
- Botão "Iniciar teleconsulta" → cria sala se não existir, abre painel split: vídeo (iframe `<DailyIframe>` com meeting token owner) + abas SOAP/Receita/Atestado/SADT (reusa fluxos existentes).
- Toggle "Gravar consulta" desabilitado até paciente aceitar (badge mostra status).
- Ao final: "Encerrar" → para gravação, abre form de **Resumo do paciente** (publicar SIM/NÃO) → marca agendamento como `atendido`.

### 3.2 Agendamento — `app.agendar.tsx`
- Adicionar campo **Modalidade** (Presencial / Teleconsulta).
- Quando teleconsulta: ao salvar, dispara `criarSalaTele`, mostra modal com **link único** (`https://.../tele/{token}`) e botão "Enviar por WhatsApp" (usa `wa.me` com mensagem pré-preenchida contendo data/hora + link).

### 3.3 Paciente — `tele.$token.tsx` (nova, pública)
- Tela de sala de espera com nome do paciente, nome do médico, data/hora.
- Botão "Entrar na consulta" (ativo de -15 min até +60 min do horário).
- Modal de **consentimento de gravação** antes de entrar (se médico quiser gravar).
- Iframe Daily com meeting token não-owner.
- Ao detectar `left-meeting`: redireciona para `/tele/{token}/avaliar`.

### 3.4 Avaliação — `tele.$token.avaliar.tsx`
- Estrelas 1–5, NPS 0–10, checkboxes "áudio ok" / "vídeo ok", comentário opcional.
- Após enviar: CTA "Acessar meus documentos" → leva para `/cidadao` já com prefill.

### 3.5 Painel do cidadão — `cidadao.tsx` (estendido)
- Nova aba **"Minhas teleconsultas"** com login por **CPF + data de nascimento** (RPC nova).
- Lista as consultas teleconsulta dos últimos 72h com:
  - Resumo publicado pelo médico
  - Download dos documentos (receitas, atestados, SADT) — links assinados de `documentos_emitidos`
  - Botão "Avaliar" se ainda não avaliou
  - Status da gravação ("Disponível por 7 dias") com link

## 4. Daily.co — integração

- Secret: `DAILY_API_KEY` (pedir via `add_secret`).
- Lib: usar `@daily-co/daily-js` no browser (iframe) e `fetch` direto na REST API `https://api.daily.co/v1/...` no server (sem SDK Node — compatível com Worker).
- Rooms: privadas, `exp = horário_agendado + 2h`, `enable_recording: 'cloud'` apenas se consentido.
- Tokens: gerados via `POST /meeting-tokens` com `room_name`, `user_name`, `is_owner`, `exp`.

## 5. Segurança / LGPD

- Token do paciente é o único segredo na URL — 32 bytes random, comparado em RPC server-side (proteção contra enumeração).
- Painel do cidadão usa CPF + DN com rate limit (reaproveita padrão de `cidadao_consulta_tentativas`).
- Gravação só inicia com `consentimento_gravacao=true` (timestamp + IP gravados).
- Documentos baixados pelo cidadão são gerados sob demanda via signed URL (60s).
- Audit log já existente cobre `teleconsulta_salas` e `teleconsulta_resumos` se adicionados aos triggers de auditoria.

## 6. Arquivos a criar/editar

**Criar**
- `supabase/migrations/*_teleconsulta.sql`
- `src/lib/tele.functions.ts`, `src/lib/tele-daily.server.ts`
- `src/routes/tele.$token.tsx`, `src/routes/tele.$token.avaliar.tsx`
- `src/routes/app.atendimento.$agendamentoId.tsx`
- `src/components/tele/DailyEmbed.tsx`, `ResumoMedicoForm.tsx`, `ConsentimentoGravacao.tsx`
- `src/components/cidadao/MinhasTeleconsultas.tsx`

**Editar**
- `src/routes/app.agendar.tsx` — campo modalidade + modal pós-salvamento
- `src/routes/app.agenda-dia.tsx` / `app.recepcao.tsx` — badge "🎥 Tele" + atalho "Iniciar"
- `src/routes/cidadao.tsx` — abas (Agendamento / Teleconsultas)
- `src/lib/permissions.ts` — módulo `teleconsulta`
- `src/components/app-sidebar.tsx` — atalho "Atendimento" para médicos

## 7. Secret necessário

`DAILY_API_KEY` — criar conta em daily.co (free tier: 10k min/mês com gravação), gerar API key em Developers → API keys.

---

**Próximo passo após aprovação:** pedir `DAILY_API_KEY` via `add_secret`, criar migration, implementar server functions, depois UI.
