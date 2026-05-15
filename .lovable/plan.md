## Pacote de hardening + performance + robustez

Foco em alto impacto, baixo risco. Tudo isolado, sem refatorar lógica de negócio.

---

### 1. Segurança (banco) — migration única

```text
a) Rate limit em cidadao_consultar
   - Nova tabela cidadao_consulta_tentativas (ip, codigo, cpf_hash, created_at)
   - Função verifica: máx 5 tentativas/minuto por IP, 20/hora por CPF
   - Bloqueia brute force no único endpoint público

b) Política de INSERT em profiles
   - profiles_insert_self: WITH CHECK (id = auth.uid())
   - Hoje só o trigger handle_new_user cria; preventivo

c) Filtragem de realtime por unidade
   - Política realtime.messages restringida a staff + 
     verificação de claim do tópico (formato "unidade:<uuid>")
   - Atualizar src/lib/realtime para usar canais nomeados por unidade
   - Recepcionista da Unidade A não escuta mais eventos da B

d) Trigger de validação de CPF/CNS em pacientes
   - Hoje aceita qualquer string; adicionar CHECK via trigger
     (CPF: 11 dígitos + algoritmo, CNS: 15 dígitos + algoritmo)
   - Bloqueia digitação errada antes de salvar

e) Índices faltantes (performance + RLS)
   - agendamentos(data, profissional_id) — agenda do dia
   - agendamentos(paciente_id) — histórico do paciente
   - slots(profissional_id, data, status) — busca de horários livres
   - audit_logs(user_id, created_at DESC) — central de auditoria
   - fila_espera(unidade_id, status, urgencia) — listagem fila
```

### 2. Auth/segurança — código

```text
f) Habilitar HIBP (verificação de senha vazada) via configure_auth
   - Rejeita senhas comprometidas no signup/troca

g) Throttle no login
   - Hoje sem proteção; adicionar contador client-side + delay
     progressivo após 3 tentativas falhas (UX), backstop server
     já existe via Supabase

h) Tornar tempo de idle-logout configurável
   - src/hooks/use-idle-logout.tsx hoje hardcoded
   - Ler de uma config admin (tabela app_config) com default 15min
```

### 3. Performance — frontend

```text
i) Lazy-load das rotas pesadas
   - src/routes/app.auditoria.tsx, app.relatorios.tsx, app.agendas.tsx
   - Componentes de PDF (pdf-agenda, pdf-comprovante) já são pesados
     — code-split via dynamic import

j) Preload de fonte + LCP image no __root
   - <link rel="preload" as="font"> nas fontes Inter
   - Reduz CLS e FOIT

k) React Query — defaults globais
   - staleTime: 30s (hoje 0 → refetch a cada foco)
   - gcTime: 5min
   - refetchOnWindowFocus: false em listas grandes
   - Reduz drasticamente tráfego e re-render

l) Memo nas tabelas grandes
   - Agenda do dia, fila, pacientes: virtualizar lista quando >50 itens
     (TanStack Virtual já no projeto? confirmar; senão react-window)

m) Debounce nos campos de busca
   - app.pacientes (busca por nome/CPF) hoje refaz query a cada tecla
   - 300ms debounce
```

### 4. Robustez / a prova de erros

```text
n) Error boundaries por rota
   - errorComponent + notFoundComponent em TODAS as rotas /app/*
   - Hoje só __root tem; um erro em /app/agenda-dia quebra tudo

o) Retry automático em mutations falhas
   - React Query retry: 2 tentativas com backoff exponencial
   - Toast amigável em vez de erro técnico

p) Optimistic updates onde faz sentido
   - Marcar presente / cancelar agendamento já tem; revisar fila e chamadas

q) Sentry-like log centralizado (sem dependência externa)
   - src/lib/error-capture já existe; estender pra mandar erros
     client → server fn → audit_logs (acao='CLIENT_ERROR')
   - Permite ver erros reais em produção

r) Fallback de rede offline
   - Service Worker já existe (PWA); adicionar página offline
     amigável + cache de read-only (lista de unidades, especialidades)
```

### 5. Observabilidade

```text
s) Health check endpoint
   - /api/public/health → checa DB + auth, retorna {ok, latency}
   - Útil pra monitoramento externo

t) Web Vitals reporting
   - src/lib/web-vitals.ts → envia LCP/INP/CLS pra audit_logs
   - Sem dependência externa, dá pra ver perf real dos usuários
```

---

### Arquivos afetados

**Migrations (2 novas):**
- `supabase/migrations/<ts>_security_perf_hardening.sql` — itens a-e
- `supabase/migrations/<ts>_app_config.sql` — item h

**Código novo:**
- `src/lib/cidadao-rate-limit.ts`
- `src/lib/cpf-cns-validator.ts`
- `src/lib/web-vitals.ts`
- `src/lib/error-report.functions.ts`
- `src/components/offline-fallback.tsx`
- `src/routes/api/public/health.ts`

**Código editado:**
- `src/router.tsx` — defaults do React Query, retry global
- `src/routes/__root.tsx` — preload de fontes, error boundary global, web vitals
- `src/routes/app.*.tsx` (todas) — adicionar errorComponent
- `src/routes/app.auditoria.tsx`, `app.relatorios.tsx`, `app.agendas.tsx` — lazy-load
- `src/routes/login.tsx` — throttle progressivo
- `src/routes/cidadao.tsx` — chamar rate-limit antes do RPC
- `src/hooks/use-idle-logout.tsx` — ler config
- `src/hooks/use-realtime-*.ts` — canais por unidade
- `src/lib/error-capture.ts` — pipe pra audit_logs
- `src/components/app-sidebar.tsx` — debounce na busca (se tiver)

**Configurações:**
- `configure_auth` — habilitar HIBP

---

### O que **NÃO** vou tocar

- Lógica de negócio (RLS, triggers de agendamento, fila) — já validada
- `client.ts`, `client.server.ts`, `auth-middleware.ts`, `types.ts` — auto-gerados
- FKs lógicas — decisão consciente (auditoria + histórico cobrem)
- Migrar mutations cliente→serverFn em massa — refator grande, fora de escopo
- Schema das tabelas existentes (só adicionar índices e políticas)

### Garantias de não-regressão

- Nenhuma migração faz `DROP` de tabela/coluna/política existente
- Mudanças de RLS são **aditivas** (novas políticas, não substituição)
- Cada item é independente — se um falhar, os outros continuam valendo
- Testo a sessão atual de login + agendamento + fila depois de aplicar

---

### Tempo estimado

3 lotes (segurança DB → frontend perf → robustez/obs), ~5-7 turnos de implementação.
