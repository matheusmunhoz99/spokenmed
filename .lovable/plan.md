## Objetivo

Transformar o "Consultório" (admin@opportunity.com) em uma tela clínica de nível produto: bonita, fiel ao eSUS PEC (Ficha de Atendimento Individual / CDS v4.x), responsiva, com identidade SpokenMED, animações sutis e documentos imprimíveis (Receita, SADT, LME, Atestado) seguindo padrão SUS.

Escopo: apenas o frontend/UX do consultório, geração de PDFs e overlay de envio. Sem mexer em banco, RLS, autenticação ou regras de negócio existentes.

---

## 1. Identidade visual e shell

`src/components/consultorio/consultorio-dialog.tsx`

- Header sticky com gradiente sutil (primary → primary-glow), **logo SpokenMED** (`@/assets/spokenmed-logo.png`), título "Consultório · Atendimento Individual" e badge "eSUS PEC · CDS v4.3".
- Bloco "identidade do atendimento" estilo carteirinha: avatar com iniciais, nome grande (Sora), linha com CNS · CPF · idade · sexo · cor/raça · nacionalidade.
- Barra de meta-info do profissional: nome · CBO · CNES da unidade · INE da equipe · data/hora · turno (Manhã/Tarde/Noite).
- Cronômetro de duração do atendimento (ticando) no canto direito.
- Animações: `animate-in fade-in slide-in-from-bottom-2`, transições de tabs com `data-[state=active]:animate-in`, badges com pulse discreto em itens críticos (alergia grave).
- Layout responsivo:
  - Desktop: grid `[320px_1fr]` (sidebar resumo + área principal).
  - Mobile (<lg): sidebar colapsa em um "drawer de resumo" acionado por botão flutuante; tabs viram scroll horizontal com snap.
- Botões do header (sempre visíveis): "Salvar rascunho" (ghost), "Imprimir documentos" (outline), "Finalizar e enviar ao eSUS PEC" (primary, ícone Send).

## 2. Flags oficiais do eSUS PEC (Ficha de Atendimento Individual)

Nova aba **"Atendimento"** (primeira, antes do SOAP) reproduzindo os blocos exigidos pelo CDS:

- **Tipo de atendimento** (radio): Consulta agendada · Consulta agendada programada/cuidado continuado · Escuta inicial/orientação · Atendimento de demanda espontânea · Consulta no dia · Urgência.
- **Tipo de consulta** (radio): Primeira consulta · Consulta de retorno em <72h · Consulta agendada · Acolhimento.
- **Modalidade de atendimento** (radio): Presencial · Telessaúde (síncrono) · Telessaúde (assíncrono).
- **Local de atendimento** (select): UBS · Domicílio · Rua · Escola/creche · Polo da Academia da Saúde · Instituição/abrigo · Unidade móvel · Outros.
- **Aleitamento materno** (radio, condicional ≤2 anos): Exclusivo · Predominante · Complementado · Inexistente · Não se aplica.
- **Em uso de plantas medicinais/PICs?** (checkbox).
- **Notificação de agravo/doença** (multi-select com flags: Dengue · Chikungunya · Zika · Sífilis · Tuberculose · Hanseníase · Violência interpessoal · Acidente de trabalho).
- **Marcadores de consumo alimentar** (link "Preencher" → modal simplificado, opcional).
- **Vacinação em dia?** (radio: Sim/Não/Não verificado).
- **Racionalidade em saúde** (select, opcional): Alopatia/convencional · Medicina tradicional chinesa · Antroposofia · Homeopatia · Fitoterapia · Ayurveda.

Tudo em cards agrupados com ícones (lucide), labels em SmallCaps, hover suave.

## 3. Condutas / Encaminhamentos (também flag eSUS)

Aba **"Conduta"** (depois do Plano):
- Multi-checkbox de **Conduta/Desfecho**: Retorno para consulta agendada · Retorno para cuidado continuado · Agendamento p/ grupos · Alta do episódio · Encaminhamento intersetorial · Encaminhamento interno no dia · Encaminhamento p/ serviço especializado · Encaminhamento p/ CAPS · Encaminhamento p/ internação hospitalar · Encaminhamento p/ urgência · Encaminhamento p/ serviço de atenção domiciliar.
- **Racionalidade da conduta** (textarea curta).
- **NASF/eMulti**: matriciamento solicitado? (checkbox + área).

## 4. Receita imprimível (SUS)

Novo módulo `src/lib/pdf-receita.ts` (reaproveita `pdf-shared.ts`):
- Cabeçalho SpokenMED + dados da unidade (CNES, endereço fictício baseado em `agendamento.unidades.nome`).
- Bloco "Paciente": nome, CPF/CNS, endereço (placeholder).
- Lista de medicamentos numerada com **nome (DCB), apresentação, posologia, quantidade total por extenso, duração**.
- Tipo de receita selecionável na aba Receita: **Comum (branca) · Controle Especial (2 vias) · Antimicrobiano**.
- Rodapé com linha para assinatura/CRM/UF e carimbo, data por extenso, "Documento assinado digitalmente (ICP-Brasil)".
- Em "Controle Especial" e "Antimicrobiano", gera **2 vias** ("Via do paciente" / "Via da farmácia").
- Botão "Imprimir receita" na aba Receita (ativa quando há ≥1 medicamento).

## 5. SADT imprimível (padrão SUS/SISREG)

Novo `src/lib/pdf-sadt.ts`:
- Cabeçalho "Solicitação de Exames — SADT" + logo + CNES/INE/CBO + data.
- Bloco identificação paciente (nome, CNS, CPF, DN, sexo, telefone, endereço).
- Hipótese diagnóstica + **CID-10 principal** (puxado da aba CID).
- Tabela de exames agrupada por categoria (Laboratório, Imagem, etc.), com coluna "Justificativa clínica" e "Caráter (eletivo/prioritário/urgente)".
- Campo "Indicação clínica" multilinha.
- Rodapé assinatura/CRM, observações, "Solicitação eletrônica — eSUS PEC".
- Botão "Imprimir SADT" na aba.

## 6. LME imprimível (Componente Especializado)

Novo `src/lib/pdf-lme.ts` reproduzindo o **Formulário LME** oficial em 1–2 páginas:
- Cabeçalho "LAUDO PARA SOLICITAÇÃO, AVALIAÇÃO E AUTORIZAÇÃO DE MEDICAMENTOS DO COMPONENTE ESPECIALIZADO DA ASSISTÊNCIA FARMACÊUTICA".
- Seções numeradas como no documento original: 1) Identificação do paciente, 2) Medicamento(s) solicitado(s) — DCB, apresentação, posologia, quantidade, 3) CID-10 + diagnóstico, 4) Anamnese, 5) Exames complementares, 6) Médico solicitante (nome, CRM, CNS), 7) Autorização (em branco).
- Campos vazios renderizam como linhas para preenchimento manual quando necessário.
- Botão "Imprimir LME" na aba LME.

## 7. Atestado imprimível

Aprimorar para usar `pdf-shared.ts`:
- Cabeçalho SpokenMED + identificação do paciente + texto formal + CID (opcional, controle "Mencionar CID no atestado?" para respeitar sigilo).
- Local/data, linha de assinatura, CRM, carimbo digital.
- Botão "Imprimir atestado".

## 8. Overlay de envio ao eSUS PEC (refinado)

`src/components/consultorio/envio-esus-overlay.tsx`:
- Adicionar logo SpokenMED no header.
- Steps mais ricos (12 etapas com micro-detalhes): CADSUS → CNES → INE → CBO → validação de flags obrigatórias → montagem ficha CDS (com badge "v4.3") → compressão LEDI → assinatura ICP-Brasil → handshake TLS → envio Thrift → ACK do servidor → registro no PEC.
- Barra de progresso com gradiente animado + porcentagem.
- Animação confetti discreta (CSS-only) ao concluir.
- Card de sucesso com: protocolo, lote LEDI, CNES de origem, timestamp, "Médico OK ✓ · CNES OK ✓ · INE OK ✓ · Ficha aceita ✓" em badges verdes.
- Botão "Imprimir comprovante de envio" (gera PDF leve).

## 9. CID-10 e medicamentos — base ampliada

- Expandir `src/lib/mock/cid10.ts` para ~150 entradas APS (atenção primária).
- Expandir `src/lib/mock/medicamentos.ts` com apresentação separada (nome DCB, concentração, forma farmacêutica) para alimentar a receita estruturada.

## 10. Detalhes técnicos

- Tokens em `src/styles.css` já existem; adicionar (se faltar) `--gradient-clinical`, `--shadow-clinical-card`. Nenhuma cor hard-coded em componentes.
- Reuso máximo do `pdf-shared.ts` (drawHeader, drawFooter, loadLogo).
- Persistência: **nenhuma** — tudo state local (já é simulação).
- Acessibilidade: labels associados, aria-live no overlay, foco preso no dialog (já fullscreen).
- Mobile-first: tabs com scroll horizontal + snap; cards empilháveis; botões de imprimir vão para um menu "Documentos" em mobile.
- Sem novas dependências (já temos jsPDF + autoTable).

## Arquivos

```
edit   src/components/consultorio/consultorio-dialog.tsx     (reescrita ampla)
edit   src/components/consultorio/envio-esus-overlay.tsx     (refino + logo + confetti)
new    src/components/consultorio/tab-atendimento.tsx        (flags eSUS)
new    src/components/consultorio/tab-conduta.tsx
new    src/lib/pdf-receita.ts
new    src/lib/pdf-sadt.ts
new    src/lib/pdf-lme.ts
new    src/lib/pdf-atestado.ts
edit   src/lib/mock/cid10.ts                                 (ampliar)
edit   src/lib/mock/medicamentos.ts                          (estruturar)
edit   src/styles.css                                        (tokens clínicos, se necessário)
```

## Fora de escopo

- Persistência real no Supabase.
- Envio real ao eSUS PEC / Thrift / CADSUS.
- Assinatura digital real (ICP-Brasil).
- Alterações em outras telas (agenda, fila, pacientes).
