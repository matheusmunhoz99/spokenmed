# Plano — Consultório responsivo no celular

## Diagnóstico

No mobile (375px) o `<header>` do dialog do consultório usa `flex-wrap items-center gap-3` com 4 blocos concorrendo pelo mesmo eixo: logo, avatar+info do paciente (`flex-1 min-w-0`), bloco do timer, e botões (Finalizar + X). Como **Finalizar** e o **X** ficam fixos à direita e o avatar à esquerda, sobra uma coluna minúscula no meio onde o nome / CNS / CPF / unidade quebram letra a letra — gerando exatamente a sobreposição visual do screenshot.

Além do header, a sidebar de 320px é forçada acima do `<main>` no mobile (grid `grid-cols-1`) ocupando muito espaço antes do paciente conseguir ver o formulário.

## Mudanças (apenas UI, sem mexer em lógica/dados/PDF)

### 1. Header redesenhado em duas camadas no mobile

- **Linha 1 (sempre visível, compacta):** avatar (h-9) + nome truncado em **1 linha** + botão **Finalizar** (texto curto) + **X**. Sem badges, sem CNS, sem unidade.
- **Linha 2 (mobile):** chips horizontais roláveis com CNS, CPF, horário, unidade — em `overflow-x-auto` para não quebrarem.
- **Desktop (≥lg):** mantém o layout atual rico (logo + divisor + badges + timer + ações em linha).
- Logo `SpokenMED` e divisor: escondidos no mobile (`hidden lg:block`).
- Timer separado: escondido no mobile (já está com `sm:flex`), indicador de rascunho vai para a linha 2.
- Botão **Salvar rascunho** continua `hidden md:inline-flex`.

### 2. Sidebar (paciente / alergias / antropometria / histórico) vira drawer no mobile

- No mobile: substituir o card lateral por um botão **"Resumo do paciente"** com ícone, abrindo um `Sheet` lateral com o conteúdo completo da sidebar atual.
- Adicionar também um chip de aviso `Alergias (n)` ao lado do nome no header quando houver alergia grave, para não esconder informação crítica.
- `≥ lg`: comportamento atual (sidebar fixa de 320px ao lado do main).

### 3. Conteúdo principal — afinar para mobile

- Tabs: reduzir gap e padding, `text-xs` no mobile, manter `overflow-x-auto` já presente.
- Inputs/Textareas das abas SOAP, CID, Alergias, Antropometria, Prescrição: usar `text-base` (16px) no mobile para evitar o **zoom automático do iOS/Android** ao focar.
- Grid `sm:grid-cols-[1fr_1fr_140px_auto]` na aba Alergias: empilhar em `grid-cols-1` no mobile com botão de adicionar full-width.
- Padding global do main: `p-3` no mobile em vez de `p-4`.

### 4. Barra de ação fixa no rodapé do mobile

- No mobile, adicionar uma `<div className="sticky bottom-0 ...">` dentro do dialog com: botão **Finalizar e enviar ao eSUS PEC** (full-width, alto, fácil polegar) + botão secundário **Salvar rascunho**.
- Remove o botão Finalizar da linha 1 do header no mobile (mantém só o X), evitando aperto no topo.
- Adicionar `pb-[env(safe-area-inset-bottom)]` para iPhones com notch/home bar.

### 5. Ajustes finos

- `DialogContent`/wrapper `fixed inset-0` → garantir `h-[100dvh]` (não `h-screen`) para não passar atrás da barra de URL do Chrome Android.
- Header: trocar `flex-wrap` por layout em coluna no mobile (`flex-col gap-2 sm:flex-row sm:items-center`).
- Verificar que o `Drawer/Sheet` da sidebar não atrapalhe o scroll do main quando aberto.

## Arquivos afetados

- `src/components/consultorio/consultorio-dialog.tsx` — único arquivo, todas as alterações são de layout/Tailwind. Lógica de auto-save, atalhos, finalização, alergias, etc. permanece igual.

## Fora de escopo

- Backend, RPC, RLS, PDFs, validações.
- Outras telas (agenda, pacientes, login).

## Confirmação rápida

Quer que eu também aplique a mesma "linha 2 com chips roláveis" desktop quando a janela for estreita (`< xl`), ou só no mobile? Por padrão vou aplicar **só no mobile** (`< lg`).
