## O que vou fazer

Três frentes, executadas em ordem.

---

### 1. CPF no topo do cadastro de paciente

Na tela **Pacientes → Novo**, o CPF vira o primeiro campo, com foco automático.

- Ao digitar 11 dígitos válidos, dispara busca no CADSUS automaticamente (sem precisar clicar em "Buscar").
- Se o CADSUS retornar, preenche sozinho: nome, nome social, CNS, nascimento, sexo, nome da mãe, telefone, endereço (CEP/logradouro/bairro/cidade/UF).
- Indicador visual de "buscando…" no campo, e um toast quando preenche ("Dados do CADSUS preenchidos — confira antes de salvar").
- Se CPF já existe no banco local, mostra aviso "Paciente já cadastrado" e oferece abrir o registro existente.
- No mobile, `inputMode="numeric"` + máscara, pra abrir o teclado numérico direto.

---

### 2. Redesign do consultório

Reescrita visual e de UX do `consultorio-dialog.tsx` + abas + overlay, inspirado no eSUS PEC mas mais limpo.

**Visual + cores + hierarquia**
- Header sticky com nome do paciente, idade, sexo, CNS, alergias em destaque (chip vermelho).
- Cards coloridos por seção SOAP: Subjetivo (azul claro), Objetivo (teal), Avaliação (âmbar), Plano/Conduta (verde).
- Bloco de sinais vitais em grid com ícones (PA, FC, FR, Temp, SatO2, Peso, Altura, IMC calculado).
- Badges para CID, procedimentos, encaminhamentos.
- Tipografia maior nos campos clínicos, espaçamento generoso.

**Mobile turbinado**
- Dialog vira full-screen no mobile (`max-w-full h-[100dvh]`).
- Abas atuais (Atendimento / Conduta) viram um stepper horizontal grande, com barra de progresso.
- Bottom bar fixa com ações principais: "Salvar rascunho", "Próximo", "Finalizar". Some o footer pequeno atual.
- Campos com altura mínima 44px, teclado correto por campo (`inputMode` + `autoComplete`).
- `Textarea` cresce automaticamente conforme digita.

**Atalhos e produtividade**
- Salvar rascunho automático a cada 15s e ao trocar de aba (em `localStorage` por agendamento_id, recuperado ao reabrir).
- Atalhos: `Ctrl+S` salva rascunho, `Ctrl+Enter` finaliza, `Alt+1/2` troca de aba, `Ctrl+/` abre lista de atalhos.
- Autocomplete de CID e medicamentos com debounce menor e resultado em popover maior, navegável por seta.
- Botão "copiar do último atendimento" no Subjetivo.

**Fluxo de envio eSUS / finalização**
- `envio-esus-overlay.tsx` reescrito: timeline vertical com 4 passos (Validando → Salvando atendimento → Gerando documentos → Enviando ao eSUS), cada passo com check verde, spinner, ou erro vermelho com mensagem clara e botão "Tentar de novo".
- Ao final, tela de sucesso com resumo dos documentos gerados e botões pra baixar/imprimir cada PDF + "Voltar à fila".
- Erros do eSUS vêm com mensagem traduzida (mapa dos códigos comuns).

---

### 3. PDFs nível profissional

Refatoração de `pdf-shared.ts` pra centralizar:
- Cabeçalho com logo da unidade, nome, endereço, CNES, telefone.
- Bloco do paciente padronizado (nome, CNS, CPF, nascimento + idade, sexo).
- Bloco do profissional padronizado (nome, CRM/CRO, especialidade).
- Rodapé com data/hora, código de verificação, paginação "Pág X de Y", linha de assinatura.
- Fonte Helvetica em tamanhos consistentes (título 14, seção 11, corpo 10, rodapé 8).
- Margens 18mm, cores discretas (cinza pra linhas, primário só nos títulos).

Por documento:

- **Receita** — bloco grande de medicamentos numerados (1, 2, 3…), cada um com nome em negrito, apresentação, posologia em linha separada, duração. Suporta receita comum e controlada (segundo bloco "via farmácia").
- **Atestado** — texto centrado em fonte maior, dias por extenso e em número, CID quando o paciente autorizou, observação opcional.
- **SADT** — tabela com colunas: nº, código SIGTAP, descrição do exame, quantidade. Bloco de hipóteses diagnósticas (CID + descrição) e justificativa clínica embaixo.
- **LME** — formulário fiel ao oficial: identificação, anamnese, exames, CID, medicamento solicitado, dosagem, tempo de tratamento, médico solicitante.
- **Comprovante** — bloco grande com data/hora destacada, unidade, profissional, especialidade, procedimento, instruções de preparo (se houver), QR code com URL pública de verificação.

QA: vou renderizar cada PDF em imagem (`pdftoppm`) e revisar antes de entregar — sem texto cortado, sem sobreposição, alinhamento certo nos dois tamanhos (A4 e meia folha quando aplicável).

---

## Detalhes técnicos

- Arquivos tocados: `src/routes/app.pacientes.tsx`, `src/components/consultorio/*.tsx`, `src/lib/pdf-shared.ts`, `src/lib/pdf-receita.ts`, `src/lib/pdf-atestado.ts`, `src/lib/pdf-sadt.ts`, `src/lib/pdf-lme.ts`, `src/lib/pdf-comprovante.ts`. Nenhuma mudança de schema do banco.
- Tokens de cor adicionados em `src/styles.css` (clinical-subjective, clinical-objective, clinical-assessment, clinical-plan) em oklch, com versões dark.
- Rascunho automático usa `localStorage` (sem coluna nova no banco).
- Sem novas dependências.
- Logo da unidade: se a tabela `unidades` já tem coluna pra logo, uso. Se não tem, deixo o cabeçalho elegante só com o nome (não vou criar coluna nova sem você pedir).

## Ordem de entrega

1. CPF no topo (rápido, baixo risco).
2. Tokens de cor + redesign visual do consultório.
3. Mobile + atalhos + auto-save.
4. Overlay de envio + tela de sucesso.
5. PDFs (um por um, com QA visual entre cada).

Depois que você aprovar, executo tudo de uma vez e te aviso quando terminar.
