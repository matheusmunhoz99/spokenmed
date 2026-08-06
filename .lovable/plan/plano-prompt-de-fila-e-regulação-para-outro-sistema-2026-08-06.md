# Plano: Prompt de Fila e Regulação para outro sistema

## Objetivo
Criar um artefato (prompt/documento) completo e autocontido explicando como funciona a estrutura de **Fila de Espera**, **Regulação** e **Cotas por unidade** do SpokenMed, para que o usuário possa colar em outro projeto Lovable e o outro sistema reimplemente o mesmo comportamento.

## Escopo do documento
O prompt vai cobrir:

1. **Conceitos e fluxo geral**
   - Diferença entre fila de espera local (UBS) e fila/regulação municipal (encaminhamentos).
   - Fluxo: recepção/triagem coloca na fila → regulação distribui vagas → agendamento consome cota.

2. **Cotas de agendamento**
   - Regime por unidade: `livre` (sem limite) vs `cota` (limitado mensalmente).
   - Cotas por especialidade (`cotas_especialidade`): vagas UBS + vagas extras da Secretaria.
   - Cotas por procedimento SIGTAP (`cotas_procedimento`): opcional, só limita se houver cota cadastrada.
   - Cota extra da Secretaria de Saúde para urgências (`origem_agenda = 'secretaria'`).
   - Funções de controle: `consumo_cota()` e trigger `fn_ag_valida_cota()`.

3. **Fila de Espera**
   - Tabela `fila_espera` com campos: paciente, especialidade, unidade, classificação de risco SUS, urgência, CID, solicitante, procedimento, status.
   - Ordenação: status aguardando → classificação de risco → urgência → data de entrada.
   - TME (Tempo Máximo de Espera) default por cor e customizável por especialidade/unidade.
   - Ações: adicionar, alterar urgência, remover (soft-delete com motivo), agendar a partir da fila.
   - Realtime / atualização a cada 2s.

4. **Regulação / Encaminhamentos**
   - Endpoint público `/api/public/ingest` recebe JSON do sistema legado (`.exe`).
   - Tabelas `integracao_lotes` e `integracao_registros` guardam os dados brutos.
   - Tela `/app/encaminhamentos` lista guias pendentes com filtros e exportação CSV.
   - Materialização opcional para tabelas específicas (hospitalar, observação).

5. **Permissões**
   - Módulos: `fila`, `regulacao`, `cotas`, `secretaria_agendar`, `agendar`, `agenda_dia`.
   - Roles: admin, recepcionista, triagem, médico, ACS.
   - Regra: `isAdmin` tem tudo; demais precisam de `can(module, "view"|"manage")`.

6. **Tabelas e migrations necessárias**
   - Listar DDLs essenciais: `unidades.regime_agendamento`, `cotas_especialidade`, `cotas_procedimento`, `agendamentos.origem_agenda`, `fila_espera`, `integracao_lotes`, `integracao_registros`, funções `consumo_cota` e `fn_ag_valida_cota`.

7. **Checklist de implementação no outro sistema**
   - Criar tabelas/migrations.
   - Configurar roles e permissões.
   - Criar telas: fila, regulação, cotas, agendar.
   - Criar endpoint de ingestão com API key.
   - Testar fluxo completo.

## Formato de entrega
Arquivo `docs/prompt-fila-regulacao.md` no repositório, escrito em português, em tom de "prompt para outro agente Lovable", com exemplos de SQL, payload JSON e estrutura de telas.

## Não está no escopo
- Alterar código do SpokenMed atual.
- Implementar a funcionalidade no outro sistema (apenas documentar).
- Criar código executável.
