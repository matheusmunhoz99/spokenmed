
## Objetivo

Deixar o SpokenMed com aparência e comportamento de aplicativo nativo no celular (Android e iPhone), sem cortes, sem sobreposição de menus/botões, e oferecer instalação como app no Android.

## 1. Aviso importante sobre PWA

Você pediu para perguntar se quer instalar como PWA no Android. Existem dois caminhos:

- **Manifest-only (recomendado)** — o app fica instalável (Android mostra "Adicionar à tela inicial" / banner; iOS via Compartilhar → Adicionar à tela), abre em tela cheia sem barra do navegador, com ícone próprio. **Não funciona offline.** É simples, seguro e não causa problemas no preview do editor.
- **PWA completo com Service Worker** — adiciona cache offline, mas é bem mais frágil: pode servir versão desatualizada, quebrar o preview do editor, e exigir manutenção contínua. Não recomendado para um sistema de agendamento que precisa sempre exibir dados atualizados do servidor.

**Vou seguir com manifest-only**, que entrega exatamente o que você pediu (instalação como app no Android, comportamento de app no iPhone) sem os efeitos colaterais.

## 2. Layout mobile (cara de app nativo)

**Header/Sidebar (`src/routes/app.tsx` + `src/components/app-sidebar.tsx`)**
- No mobile, a sidebar já vira "offcanvas" (abre por cima ao tocar no menu). Vou garantir que:
  - O `SidebarTrigger` (botão hamburguer) fique sempre visível no header.
  - O header mobile fique mais compacto (h-12), com o título centralizado e tipografia menor.
  - O conteúdo principal use `p-4` no mobile e `p-6` no desktop (hoje está fixo em `p-6`, encosta nas bordas).
  - Adicionar `safe-area-inset` (padding-top/bottom) para iPhone com notch e barra inferior.

**Bottom Navigation (mobile)**
- Adicionar uma barra inferior fixa no mobile com 4 atalhos: Painel, Agenda do Dia, Agendar, Pacientes. Aparece só em telas `<md` e respeita safe-area do iPhone. Remove a necessidade de abrir o menu o tempo todo — comportamento de app nativo.

**Tabelas viram cards no mobile**
As telas com tabela larga hoje cortam no celular ou geram scroll horizontal feio. Para cada uma, no breakpoint `<md` vou renderizar uma lista de cards empilhados em vez da `<Table>`:
- `app.agenda-dia.tsx` — card por consulta (paciente, hora, profissional, status, ações)
- `app.pacientes.tsx` — card por paciente (nome, CPF, telefone, ações)
- `app.profissionais.tsx` — card por profissional
- `app.agendas.tsx` — card por configuração de agenda
- `app.configuracoes.tsx` — cards para unidades e especialidades

A tabela continua no desktop (`md:` para cima).

**Formulários e diálogos**
- `Dialog`/`AlertDialog` com `max-h-[90vh] overflow-y-auto` e `w-[calc(100%-1rem)]` no mobile pra não estourar a tela.
- Grids de formulário (`grid-cols-2`, `grid-cols-4`) viram `grid-cols-1` no mobile.
- Botões de ação ficam full-width no mobile, lado-a-lado no desktop.
- Inputs com `text-base` no mobile (evita o zoom automático do iOS quando fonte < 16px).
- Toolbars de filtros (data, unidade, profissional) viram coluna única no mobile com largura total.

**Tela de login (`src/routes/login.tsx`)**
- Garantir que o card cabe na tela com padding lateral, sem scroll horizontal, e que o teclado mobile não tampa o botão.

**Toaster**
- Mover `position` para `top-center` no mobile (hoje está `top-right`, fica apertado e cobre o botão de menu).

## 3. PWA básico (instalável)

**Manifest (`public/manifest.webmanifest`)**
```json
{
  "name": "SpokenMed",
  "short_name": "SpokenMed",
  "description": "Agendamento Médico Municipal",
  "start_url": "/app",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b0f17",
  "theme_color": "#0b0f17",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Ícones** — gerar 3 PNGs (192, 512, 512 maskable) a partir do logo do SpokenMed, salvos em `public/icons/`.

**Meta tags no `__root.tsx`**
- `link rel="manifest"` apontando para `/manifest.webmanifest`
- `theme-color` (Android colore a status bar)
- `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title=SpokenMed` (iPhone abre em tela cheia ao adicionar à tela inicial)
- `link rel="apple-touch-icon"` para o ícone no iPhone
- viewport com `viewport-fit=cover` (libera safe-area do notch)

**Banner "Instalar como app" (Android)**
- Componente `<InstallPwaPrompt />` montado no `__root.tsx`.
- Escuta o evento `beforeinstallprompt` (só dispara no Chrome/Edge Android).
- Mostra um banner discreto na parte de baixo: "Instalar SpokenMed como app?" com botões **Instalar** e **Agora não**.
- Se aceitar → chama `prompt()` nativo do Chrome.
- Se recusar → guarda flag em `localStorage` e não pergunta de novo por 30 dias.
- No iPhone (Safari não suporta `beforeinstallprompt`): se detectar iOS + Safari + não-standalone, mostrar banner com instrução curta: "Toque em Compartilhar → Adicionar à Tela de Início".

## 4. CSS global (`src/styles.css`)

- `html, body { overscroll-behavior-y: none; }` — remove o efeito "puxar para recarregar" que parece web e não app.
- `body { -webkit-tap-highlight-color: transparent; }` — remove o flash azul ao tocar.
- Variáveis `--safe-top`, `--safe-bottom` usando `env(safe-area-inset-*)` para usar nos componentes.

## 5. Testes (eu testo antes de entregar)

Vou abrir o preview em viewports reais e validar cada tela:
- **iPhone SE (375×667)** — pior caso de largura
- **iPhone 14 (390×844)** — referência iOS
- **Pixel/Galaxy (360×800)** — referência Android

Em cada viewport, vou navegar por: Login → Painel → Agenda do Dia → Agendar → Pacientes → Profissionais → Agendas → Configurações, abrir um diálogo de cadastro e fechar, abrir e fechar o menu lateral. Confirmo que nada estoura, nenhum botão fica coberto, a bottom-nav não tampa conteúdo e o header não sobrepõe o título da página.

---

### Resumo dos arquivos que serão tocados

- `src/routes/__root.tsx` — meta PWA, viewport-fit, montar `<InstallPwaPrompt />`, toaster mobile
- `src/routes/app.tsx` — header/main responsivos + safe-area + bottom-nav mobile
- `src/components/app-sidebar.tsx` — ajustes mobile
- `src/components/install-pwa-prompt.tsx` — **novo**, banner Android + dica iOS
- `src/components/mobile-bottom-nav.tsx` — **novo**
- `src/routes/app.agenda-dia.tsx`, `app.pacientes.tsx`, `app.profissionais.tsx`, `app.agendas.tsx`, `app.configuracoes.tsx`, `app.configuracoes.sistema.tsx`, `app.agendar.tsx`, `app.index.tsx`, `login.tsx` — versão mobile (cards no lugar de tabela, grids 1-coluna, botões full-width, dialogs adaptados)
- `src/styles.css` — overscroll, tap-highlight, vars safe-area
- `public/manifest.webmanifest` — **novo**
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — **novos** (gerados do logo)
