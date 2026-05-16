# Plano — Fase 1: feel de app nativo + refresh visual

Foco em **mobile** (iPhone/Android). Desktop ganha só o ajuste de paleta e fonte, sem mexer em layouts.

## 1. Identidade visual (leve, em todo o app)

**Paleta "Clínico Sereno"** — atualizar tokens em `src/styles.css`:
- Background `#fafbfc`, surface `#ffffff`, borda `#e8ecf1`
- Primary teal `#2d8a9e` (claro) / `#5cbdb9` (escuro)
- Texto principal `#0c2340`, secundário slate-500
- Sombras mais suaves (`shadow-sm`/`shadow-md` redefinidos com blur maior e opacidade menor)
- `--radius` de `0.5rem` → `0.75rem` (mais cara de iOS)

**Tipografia Sora + Manrope** — adicionar via `<link>` no `__root.tsx`, definir no `body` (`font-family: Manrope`) e em headings (`font-family: Sora`). Tracking levemente negativo nos títulos. Tamanho-base 15px no desktop, 16px mobile (já tem regra).

**Por que não vai "parecer IA":** paleta sóbria de um tom só, tipografia humanista (não a Inter de todo template), espaçamento generoso, zero gradientes coloridos, zero emojis, microcópia em PT-BR natural ("Tudo certo por aqui", "Nada por enquanto" em vez de "No data available").

## 2. Cara de app nativo (mobile)

### 2.1 Transições de página + haptics
- Criar `src/hooks/use-haptics.ts` usando `navigator.vibrate` (Android) com fallback silencioso (iOS PWA não suporta, mas não quebra). Disparar em: salvar, deletar, chamar paciente, erro.
- Wrapper `<PageTransition>` no `<Outlet />` do `app.tsx`: detecta mobile e aplica `animate-in slide-in-from-right-4 fade-in` em entrada de rota nova, `slide-in-from-left-4` ao voltar. Desktop: só fade leve.

### 2.2 Bottom sheets em vez de dialogs (mobile)
- Criar `src/components/ui/responsive-dialog.tsx`: componente único que renderiza `<Dialog>` no desktop e `<Drawer>` (vaul, já instalado) no mobile via `useIsMobile()`. API igual ao Dialog (`<ResponsiveDialog>`, `Trigger`, `Content`, `Header`, `Title`, `Footer`).
- Migrar usos críticos: `PacienteDialog` (em `app.pacientes.tsx`), `chamar-dialog`, `encaixe-dialog`, `reagendar-dialog`, `historico-dialog`, `anexos-dialog`, `permissions-dialog`. Não trocar nada da lógica interna — só o invólucro.
- Drawer com `snapPoints` permitindo arrastar pra fechar; handle visual no topo.

### 2.3 Pull-to-refresh
- Criar `src/components/pull-to-refresh.tsx`: usa `touchstart/touchmove` no scroll container, mostra spinner discreto no topo quando puxa >60px. Só mobile.
- Aplicar em: `app.agenda-dia.tsx`, `app.fila.tsx`, `app.pacientes.tsx` (quando há resultado), `app.index.tsx`. `onRefresh` chama `queryClient.invalidateQueries` da query da página + haptic leve.

### 2.4 Swipe-actions nas listas
- Criar `src/components/swipe-row.tsx`: wrapper com gesture (CSS transform + touch handlers, sem libs novas). Arrastar pra esquerda revela 1–2 botões de ação.
- Aplicar em:
  - Fila: swipe → "Chamar" + "Adiar"
  - Pacientes: swipe → "Editar" + "Histórico"
  - Agenda do dia: swipe → "Reagendar" + "Faltou"
- Desktop: ações continuam nos botões/menu existentes (componente vira no-op).

### 2.5 Skeleton loaders
- Criar 3 skeletons reutilizáveis em `src/components/skeletons/`: `list-skeleton.tsx`, `card-skeleton.tsx`, `table-skeleton.tsx` (usam `<Skeleton>` shadcn já presente).
- Substituir `<Loader2 className="animate-spin" />` em: Agenda, Fila, Pacientes, Painel, Profissionais. Spinner só fica em ações pontuais (botão "Salvar").

### 2.6 Splash + status bar polidos (PWA)
- `manifest.webmanifest`: trocar `background_color`/`theme_color` para `#fafbfc` (claro) e adicionar `theme_color` escuro via `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0c2340">` no `__root.tsx`.
- Adicionar `<meta name="apple-mobile-web-app-status-bar-style" content="default">` e `<meta name="apple-mobile-web-app-capable" content="yes">`.
- Verificar que `apple-touch-icon` aponta pra `/icons/icon-512.png`.

### 2.7 Bottom nav polida
- Aumentar tap targets pra 48px, adicionar leve "spring" no item ativo (scale 1.08 + cor primary), badge de contagem na Fila quando houver pendências.
- Indicador ativo: barrinha de 3px no topo do item ativo em vez de só mudar cor.

## 3. O que NÃO entra nessa fase
- Reescrita de layouts desktop, novas telas, mudança em backend, em CSV/PDF, em CadSUS, em permissões.

## Técnico

**Arquivos novos:**
- `src/hooks/use-haptics.ts`
- `src/components/ui/responsive-dialog.tsx`
- `src/components/pull-to-refresh.tsx`
- `src/components/swipe-row.tsx`
- `src/components/page-transition.tsx`
- `src/components/skeletons/{list,card,table}-skeleton.tsx`

**Arquivos editados:**
- `src/styles.css` (paleta + radius + sombras + fonts)
- `src/routes/__root.tsx` (links de fonte, metas iOS, theme-color)
- `src/routes/app.tsx` (PageTransition no Outlet)
- `src/components/mobile-bottom-nav.tsx` (indicador + tap target)
- `public/manifest.webmanifest` (cores)
- Rotas que viram bottom sheet: `app.pacientes.tsx` + 5 dialogs
- Rotas com pull-to-refresh + skeletons: `app.agenda-dia.tsx`, `app.fila.tsx`, `app.pacientes.tsx`, `app.index.tsx`

**Sem novas dependências** (vaul, lucide, radix já presentes).

## Entrega
Implemento tudo em um único passo (são alterações coordenadas). Depois você testa no celular instalado como PWA e me diz o que ajustar.
