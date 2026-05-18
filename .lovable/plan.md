## Objetivo

Deixar o splash screen do APK Android tão bonito quanto o PWA — fundo claro da marca + logo centralizado com respiro, sem o quadrado preto atual.

## Mudanças

### 1. `public/manifest.webmanifest`
- Manter `background_color: #fafbfc` (tela do splash, claro da marca).
- Atualizar `theme_color` de `#fafbfc` para `#1c7a8c` (teal primary aproximado do design system) — deixa a status bar combinando com a marca durante a abertura.

### 2. Regerar os 3 PNGs em `public/icons/`
Usando o `src/assets/spokenmed-logo.png` como base, gerar:

- `icon-512.png` (512x512) — logo SpokenMED centralizado sobre fundo `#fafbfc`, com ~22% de margem em cada lado (safe zone padrão Android 12+ para splash).
- `icon-192.png` (192x192) — mesma composição reduzida.
- `icon-maskable-512.png` (512x512) — mesma composição, porém com **~20% de safe zone reforçada** (Android pode cortar em círculo/squircle dependendo do launcher), fundo `#fafbfc` preenchendo até as bordas para não aparecer transparência preta.

Todos com fundo sólido `#fafbfc` (não transparente) — é isso que elimina o "quadrado preto" no splash do APK.

### 3. Aviso obrigatório ao final
APKs já instalados **não atualizam o splash sozinhos**: você precisa gerar um novo APK (via PWA Builder / Bubblewrap) e reinstalar no celular para ver a mudança. PWA no navegador reflete na hora.

## Fora de escopo
- Service worker, lógica de PWA, código da aplicação.
- Splash screen customizado nativo Android (exigiria mexer no projeto Bubblewrap, fora do repo web).
