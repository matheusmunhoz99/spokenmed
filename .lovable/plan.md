# Plano: /verificar polido + auditoria SUS da regulação/fila/agenda

Dois blocos independentes. Posso entregar em ordem ou em paralelo.

---

## Bloco 1 — Refinar página `/verificar` (visual + auditoria)

Hoje a página mostra um card verde discreto. Vou destacar status com cor grande e listar o histórico de verificações do documento.

1. **Hero de status colorido grande** no topo do resultado:
   - Verde "DOCUMENTO AUTÊNTICO" (válido), Âmbar "EXPIRADO" (passou validade_dias), Vermelho "CANCELADO" / "NÃO ENCONTRADO". Ícone grande, tipografia bold, badge com data de emissão e validade restante ("expira em 12 dias").
2. **Linha do tempo de eventos de auditoria** abaixo do card:
   - Mostra `receita_logs` (emitida, cancelada) + cada consulta pública (data, IP mascarado, user-agent resumido) — útil pra farmácia ver "este código já foi consultado 3x hoje".
   - Requer pequena migração: tabela `receita_verificacoes` (id, receita_id, consultado_em, ip_hash, user_agent_resumo) + ajustar RPC `verificar_receita`/`verificar_documento` pra inserir log e retornar contagem.
   - RPC pública `listar_eventos_documento(p_protocolo)` retornando lista mascarada (sem IP cru) para a página.
3. **Microcópia de confiança**: "Consultado X vezes nas últimas 24h", "Última consulta há Y min", aviso de fraude quando contagem anormal (>20/h).
4. **Responsivo mobile**: hero ocupa largura toda, timeline em coluna única, botão "compartilhar verificação" via Web Share API.

Arquivos: `src/routes/verificar.tsx`, nova migration p/ tabela + RPC, ajuste em `verificar_documento`.

---

## Bloco 2 — Auditoria SUS de regulação / fila / agendamento

Comparei o schema atual contra o que SISREG III, e-SUS APS PEC 5.4 e PNH (Política Nacional de Humanização) exigem em apps de regulação ambulatorial. Resumo do que **falta** e proposta de implementação.

### 2.1. Classificação de risco (CRÍTICO)

- **Hoje**: `fila_urgencia` = `normal | prioritaria | urgente` (3 níveis, sem padrão).
- **SUS exige**: Protocolo de Manchester (5 cores) ou Acolhimento com Classificação de Risco (ACCR). Sem isso a fila não é auditável pelo MS.
- **Ação**: criar enum `classificacao_risco` (`vermelho`, `laranja`, `amarelo`, `verde`, `azul`) + coluna em `fila_espera` e `agendamentos` com tempo-alvo de atendimento por cor (0/10/60/120/240 min). Ordenação da fila passa a respeitar cor → urgência → chegada.

### 2.2. Cotas / tetos físico-financeiros (FALTA TOTALMENTE)

- **Hoje**: não existe controle de cota. Qualquer unidade pode agendar sem limite.
- **SUS exige**: PPI (Programação Pactuada Integrada) e FPO definem teto mensal por unidade × procedimento × competência.
- **Ação**: nova tabela `cotas`:
  ```
  cotas(id, unidade_id, especialidade_id?, procedimento_id?,
        competencia date,  -- 1º dia do mês
        qtd_total int, qtd_utilizada int generated,
        origem text -- 'PPI'|'extra'|'judicial')
  ```
  + trigger em `agendamentos` que decrementa cota ao agendar e devolve ao cancelar; bloqueia agendamento se `qtd_utilizada >= qtd_total` salvo override admin com justificativa logada.
  + Tela `app.cotas.tsx` (admin/regulador) para configurar e ver saldo em tempo real.

### 2.3. Solicitação / encaminhamento (FALTA)

- **Hoje**: o paciente entra na fila direto pela recepção, sem registro de quem solicitou.
- **SUS exige (SISREG)**: toda vaga ambulatorial precisa de **médico solicitante** (nome, CNS, CBO, CRM/UF), **unidade solicitante**, **CID-10** e **justificativa clínica** (laudo).
- **Ação**: nova tabela `solicitacoes_regulacao` (1↔1 com `fila_espera`) com esses campos + status (`pendente`, `autorizada`, `negada`, `devolvida`, `executada`) e motivo. Dialog "Inserir na fila" pede esses dados.

### 2.4. Cartão Nacional de Saúde (CNS)

- **Hoje**: `pacientes` tem CPF mas (verificar) sem CNS obrigatório/validado.
- **SUS exige**: CNS de 15 dígitos com dígito verificador para qualquer envio ao DataSUS/e-SUS.
- **Ação**: garantir coluna `cns` em `pacientes` com check de dígito verificador e exibir/forçar no cadastro. Validação client + trigger.

### 2.5. Tempo Máximo de Espera (TME) e alertas

- **Hoje**: fila não tem alvo de tempo nem alerta de estouro.
- **Ação**: campo `prazo_max_dias` por especialidade/procedimento + query que marca registros estourados em vermelho na tela da fila + relatório "fila por tempo de espera".

### 2.6. Auditoria de regulação

- **Hoje**: `audit_logs` cobre INSERT/UPDATE genéricos.
- **SUS exige**: trilha específica de quem autorizou/negou/devolveu cada solicitação, com motivo.
- **Ação**: tabela `regulacao_eventos(solicitacao_id, evento, autor_id, motivo, em)` + view consolidada.

### 2.7. Pequenos ajustes que também faltam

- **Encaixe**: hoje permite criar fora de slot; falta exigir justificativa clínica + classificação de risco mínima "amarelo".
- **Reagendamento**: registrar motivo padronizado (lista CID-like) — exigência da PNH.
- **Cancelamento por falta**: hoje status `faltou` existe mas não dispara recolocação automática na fila. Sugerido trigger.
- **Confirmação prévia**: agendamentos sem `confirmado` em D-1 deveriam liberar slot p/ encaixe — não implementado.
- **Lista de espera por procedimento (não só especialidade)**: `fila_espera` só liga em `especialidade_id`; SUS regula por **procedimento SIGTAP**. Adicionar `procedimento_id` opcional.

### 2.8. O que JÁ está OK (não mexer)

- RLS por unidade (`user_can_access_unidade`) — correto e necessário pra LGPD.
- Unicidade de slot ativo, código único de agendamento, histórico de status (`agendamento_historico`), realtime na fila — bem feito.
- Carimbos de chegada/triagem/atendimento — bate com e-SUS APS.

---

## Detalhes técnicos

- Migrations agrupadas por bloco (uma para verificações, uma por área SUS) para rollback fácil.
- Sem mudança em `client.ts`, `types.ts`, `.env`.
- Todas as novas tabelas com RLS e policies espelhando o padrão atual (admin all + staff por unidade).
- Triggers de cota e auditoria via `SECURITY DEFINER` no schema `private`.
- Tela nova `/app/cotas` e tela de regulação `/app/regulacao` (lista de solicitações para autorizar).

---

## Sugestão de ordem

1. Bloco 1 inteiro (rápido, ~1 entrega).
2. Bloco 2 em fatias: **2.1 classificação de risco** + **2.4 CNS** (mais baratos e visíveis) → **2.2 cotas** (maior impacto regulatório) → **2.3 solicitação + 2.6 auditoria regulação** → **2.5/2.7 polimentos**.

Me diga se quer tudo de uma vez, só o Bloco 1, ou priorizar uma fatia específica do Bloco 2.

