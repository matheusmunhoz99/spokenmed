## O que mudar nos PDFs

### 1. Paleta — alinhar com o site (teal, não azul)

O sistema usa `--primary: oklch(0.52 0.09 195)` (família teal/ciano). Os PDFs estão usando azul `#2563eb`, que destoa. Atualizar `PDF_COLORS` em `src/lib/pdf-shared.ts`:

- `primary`: teal escuro `#0f766e` (slate-teal do site)
- `primaryDark`: `#0b5d57` (faixa inferior do header)
- `primarySoft`: `#ccfbf1` (banda de destaque, faixa do profissional)
- `ink` `#0f172a`, `muted` `#64748b`, `border` `#e2e8f0`, `surface` `#f8fafc` — manter
- Status chips: confirmado verde, atendido teal, faltou vermelho, cancelado cinza, agendado teal-soft

### 2. Logo bem visível no cabeçalho

Problema atual: logo teal sobre fundo azul claro fica quase invisível e a arte tem muito espaço em branco em volta.

Solução de design (mantém a identidade do logo intacta, sem inverter cores):
- Fundo do header passa a ser teal escuro do site (`primary`)
- Dentro do header, desenhar um **painel branco arredondado** (≈ 160 × 60pt) à esquerda, com sombra sutil (linha mais clara abaixo). Embutir o logo dentro do painel branco — assim o teal do logo aparece nítido e cria contraste com o header escuro.
- Aumentar a altura do header de 84pt → 100pt para acomodar o painel com respiro.
- Título "Comprovante de Agendamento" / "Agenda do Dia" em branco à direita, mantendo hierarquia atual.

### 3. Refinamentos visuais

- Banda de Data/Horário: fundo `primarySoft` com borda `primary` 0.5pt + número de hora em `primary` bem grande (28pt) — atualizar tons para o novo teal.
- Cards (comprovante): aumentar padding interno (16→20pt), título do card em letterspacing maior, sombra sutil (linha cinza 0.4pt 1pt abaixo) para sensação de "papel".
- Tabela da agenda: cabeçalho em teal escuro, linhas com altura mínima 28pt, chip de especialidade com borda teal sólida em vez do contorno fino atual.
- Lembretes: trocar o amarelo por um tom âmbar mais sóbrio (`#fef3c7` bg, `#92400e` texto) — já está, só ajustar contraste.
- Rodapé: linha superior em `border`, ícone do logo em miniatura (≈ 14pt altura) à esquerda + nome "SpokenMED" em teal pequeno.

### 4. Comportamento — preview em vez de download

Hoje os dois PDFs chamam `doc.save(...)` que dispara download. Trocar por **abrir em nova aba** usando `doc.output("bloburl")`:

```ts
const url = doc.output("bloburl");
window.open(url, "_blank");
```

Assim o navegador abre o visualizador nativo de PDF e o usuário decide imprimir (Ctrl+P) ou baixar. Aplicar em:
- `gerarPdfAgenda` (botão "Exportar PDF" em `app.agenda-dia.tsx`)
- `gerarComprovante` (diálogo após criar agendamento em `app.agendar.tsx`) — manter o mesmo fluxo, só mudar o destino.

Como pop-ups podem ser bloqueados, fazer fallback: se `window.open` retornar `null`, cair em `doc.save(...)` e mostrar um toast informando ("Permita pop-ups para visualizar antes de imprimir").

### Arquivos afetados

- `src/lib/pdf-shared.ts` — nova paleta, header com painel branco do logo, rodapé com mini-logo, helper `openPdf(doc, filename)` com preview + fallback.
- `src/lib/pdf-comprovante.ts` — usar `openPdf` em vez de `doc.save`, ajustar tons/espaçamentos.
- `src/lib/pdf-agenda.ts` — usar `openPdf`, aplicar nova paleta e refinamentos da tabela/chip.

Sem mudanças de banco, RLS, autenticação ou rotas.
