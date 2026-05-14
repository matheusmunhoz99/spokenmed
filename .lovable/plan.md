## Objetivo

1. Melhorar o fluxo de **Agendar consulta**: manter Unidade como primeiro filtro, e fazer Especialidade ↔ Profissional se filtrarem mutuamente (qualquer ordem funciona).
2. Repaginar os **PDFs** (comprovante de agendamento e agenda do dia) com logo do sistema, tipografia e layout mais refinados.

---

## 1. Tela de Agendar (`src/routes/app.agendar.tsx`)

**Ordem fixa visual:** Unidade → Especialidade → Profissional → Data.

**Comportamento dos filtros (cross-filter):**

- **Unidade** (obrigatório, primeiro):
  - Define o universo de profissionais (via `profissional_unidades`).
  - Limpa Especialidade e Profissional ao trocar.

- **Especialidade** (opcional):
  - Lista apenas as especialidades que existem entre os profissionais ativos da unidade selecionada (não mostra especialidades vazias).
  - Se um Profissional já estiver selecionado, mostra apenas a especialidade dele (e a auto-seleciona).
  - Ao trocar, se o Profissional atual não pertence à nova especialidade, limpa o Profissional.

- **Profissional**:
  - Se Especialidade estiver vazia (Todas) → lista todos os profissionais ativos da unidade.
  - Se Especialidade estiver definida → lista apenas profissionais daquela especialidade na unidade.
  - Ao escolher um profissional, auto-preenche a Especialidade dele (caso ainda esteja em "Todas").

**Implementação técnica:**
- Trocar a query atual `profs-ag` por uma única query `profs-da-unidade` (carrega todos os profissionais ativos da unidade com `especialidade_id` + `especialidades(nome)`), e derivar Especialidades e lista filtrada de Profissionais via `useMemo` no cliente. Isso evita ida/volta extra ao banco e elimina estados inconsistentes.
- Remover a query separada de `especialidades-ag` (passa a ser derivada).

---

## 2. PDFs (logo + visual refinado)

**Logo:** já existe `src/assets/spokenmed-logo.png`. Carregar como dataURL uma única vez (cache em módulo) via `fetch` + `FileReader`/`canvas` para embutir em jsPDF com `doc.addImage`.

**`src/lib/pdf-comprovante.ts` — novo layout A4 retrato:**
- Cabeçalho com faixa azul mais alta (100pt), logo à esquerda (h≈48pt), título "Comprovante de Agendamento" e subtítulo "SpokenMED · Sistema de Agendamento Médico" à direita.
- Banda destacada de **Data e Horário** com fundo azul claro, ícone de calendário desenhado em vetor (sem dependência), data por extenso em destaque.
- Bloco de **Código + QR placeholder** (texto monospace estilizado) no canto.
- Cards arredondados (`roundedRect`) para Paciente / Profissional / Unidade, com label cinza pequeno acima do valor em negrito (estilo "stacked"), em vez do label-coluna atual.
- Rodapé com linha fina + logo pequeno em escala de cinza + texto de emissão + numeração de página.

**`src/lib/pdf-agenda.ts` — repaginar:**
- Mesmo cabeçalho com logo (versão landscape).
- Bloco-resumo: Unidade · Data por extenso · Total de consultas · gerado por (já existe, refinar tipografia e espaçamento, separadores em cinza claro).
- Para cada profissional: faixa cinza-clara com nome em destaque + "chip" arredondado da especialidade.
- Tabela com cabeçalho azul mais escuro, linhas zebradas suaves, status como "chip" colorido (cores por status: confirmado=verde, faltou=vermelho, cancelado=cinza, atendido=azul, agendado=azul claro).
- Rodapé idêntico ao do comprovante, com logo + "Página X de Y".

**Helpers compartilhados:** extrair para `src/lib/pdf-shared.ts`:
- `loadLogoDataUrl()` (cache).
- `drawHeader(doc, { titulo, subtitulo, orientation })`.
- `drawFooter(doc, { emitidoPor })` aplicado a todas as páginas.
- Paleta de cores constantes (primary, muted, surface, status colors).

---

## Arquivos afetados

- `src/routes/app.agendar.tsx` — refatorar filtros (sem mudar layout de cards).
- `src/lib/pdf-shared.ts` — **novo**, helpers de logo/cabeçalho/rodapé.
- `src/lib/pdf-comprovante.ts` — reescrever layout usando helpers.
- `src/lib/pdf-agenda.ts` — reescrever layout usando helpers.

Sem mudanças de banco, RLS, rotas ou autenticação.
