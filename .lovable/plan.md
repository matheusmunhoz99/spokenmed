# Consultório Simulado — padrão eSUS PEC

Adicionar, **só para o usuário `admin@opportunity.com`**, um botão "Atender" em cada linha da Agenda do Dia que abre uma tela cheia de consultório com cara de prontuário moderno (muito melhor que o eSUS PEC). Tudo é **simulação visual** — nada é persistido no banco.

## Escopo visual

- Botão `Stethoscope` ("Atender") na lista de `src/routes/app.agenda-dia.tsx`, visível apenas quando `user?.email === "admin@opportunity.com"`.
- Abre `ConsultorioDialog` em **fullscreen** (sheet/dialog `inset-0`), com header fixo mostrando paciente, idade, CNS, alergias em destaque vermelho, e botão Finalizar.
- Layout em 2 colunas no desktop, abas no mobile:
  - **Coluna esquerda (resumo):** dados do paciente, condições, alergias, medicações em uso, últimos atendimentos (mock).
  - **Coluna direita (abas):**
    1. **SOAP** — 4 textareas (Subjetivo / Objetivo / Avaliação / Plano) com auto-grow, contador de caracteres, atalhos.
    2. **CID / CIAP** — combobox com busca local (lista mock dos CIDs mais comuns na APS: I10, E11, J00, M54, F32, Z00, etc.) permitindo múltiplos.
    3. **Alergias** — adicionar/remover tags (substância + reação + gravidade).
    4. **Atestado** — modelo pré-preenchido (dias, CID opcional, repouso), preview formatado.
    5. **Receita** — receituário simples e especial; itens com nome, posologia, quantidade, duração; botão "+ medicamento".
    6. **Guia de Referência (SISREG)** — especialidade, prioridade, hipótese diagnóstica, justificativa.
    7. **SADT** — exames (lista mock: hemograma, glicemia, EAS, USG, etc.) com checklist.
    8. **LME** — formulário de Alto Custo com CID obrigatório, medicamento, CAS, posologia, tempo de tratamento, anamnese.
- Visual "Clínico Sereno": cards com `rounded-xl`, sombras suaves, tipografia Sora/Manrope, ícones Lucide, badges semânticos. Sem gradientes berrantes.

## Fluxo de "Finalizar consulta"

Ao clicar **Finalizar e enviar ao eSUS PEC**, abre um overlay modal central com:
- Título: "Enviando ficha de atendimento ao eSUS PEC"
- Lista de passos animados (cada um leva ~600-900ms, com check verde ao terminar):
  1. Validando CNS do paciente…
  2. Verificando CNES da unidade…
  3. Validando INE da equipe…
  4. Conferindo CBO do profissional…
  5. Montando ficha CDS (Atendimento Individual)…
  6. Assinando digitalmente…
  7. Transmitindo ao eSUS PEC (Thrift)…
  8. Confirmando recebimento (LEDI)…
- Ao final: card verde "Atendimento finalizado com sucesso" + protocolo fake (`PEC-{timestamp}`), botão **Fechar**.
- Ao fechar: dialog do consultório fecha, e na linha da agenda o paciente aparece com badge "Atendido" (apenas localmente, via `useState`/optimistic — **não chama Supabase**) e um pequeno ícone ✓ verde + tooltip "Enviado ao eSUS PEC · protocolo X".

## Arquivos

**Novos:**
- `src/components/consultorio/consultorio-dialog.tsx` — shell fullscreen + tabs.
- `src/components/consultorio/tab-soap.tsx`
- `src/components/consultorio/tab-cid.tsx`
- `src/components/consultorio/tab-alergias.tsx`
- `src/components/consultorio/tab-atestado.tsx`
- `src/components/consultorio/tab-receita.tsx`
- `src/components/consultorio/tab-guia.tsx`
- `src/components/consultorio/tab-sadt.tsx`
- `src/components/consultorio/tab-lme.tsx`
- `src/components/consultorio/envio-esus-overlay.tsx` — timer animado dos 8 passos.
- `src/lib/mock/cid10.ts` — ~80 CIDs comuns.
- `src/lib/mock/medicamentos.ts` — ~40 medicamentos APS.
- `src/lib/mock/exames-sadt.ts` — lista de exames.

**Editados:**
- `src/routes/app.agenda-dia.tsx` — botão Atender condicional + estado local `atendidosSimulados: Set<string>` + badge visual.

## Detalhes técnicos

- Nada toca em Supabase. Todo estado é `useState` dentro do `ConsultorioDialog`. Ao fechar/finalizar, o estado é descartado.
- Restrição por email: `const isMedicoSimulado = user?.email === "admin@opportunity.com"`. Sem mudanças em roles/permissões/RLS.
- `envio-esus-overlay` usa `setTimeout` encadeado + `framer-motion` se já presente (caso contrário, transições CSS via Tailwind `animate-*` já no projeto).
- Acessibilidade: foco preso no dialog, ESC fecha (com confirmação se houver texto digitado), `aria-live` no overlay de envio.
- Mobile: usa `ResponsiveDialog` existente (drawer no mobile, dialog no desktop) com as abas viradas em accordion vertical.
- Print-friendly: atestado/receita têm `@media print` opcional caso o usuário queira "imprimir" (mockado, sem PDF — fora do escopo).

## Fora do escopo

- Geração real de PDF.
- Persistência em qualquer tabela.
- Integração real com eSUS PEC / Thrift / CADSUS.
- Alterar permissões ou roles de outros usuários.
