# Prompt: Fila de Espera + Regulação + Cotas de Agendamento

Reproduza, em outro projeto Lovable, os módulos de **Fila de Espera**, **Regulação Municipal** e **Cotas de Agendamento** do SpokenMed. Abaixo está descrito **o que o sistema faz**, **como funciona** e **quem pode fazer cada ação**. A escolha de tabelas, campos e implementação fica a cargo do outro agente/projeto.

---

## 1. Visão geral do fluxo

```text
Sistema legado (.exe) ──envia dados──┐
                                     ▼
Recepção/Triagem ──► Fila de Espera ──► Regulação ──► Agendamento ──► Cota
                          │                                    │
                          └────────────── UBS local ───────────┘
```

- **Fila de Espera**: pacientes aguardam vaga em uma unidade, ordenados por risco, urgência e data/hora de entrada.
- **Regulação**: guias/encaminhamentos vindos do sistema legado aparecem para a central de regulação decidir para qual unidade/hospital encaminhar.
- **Cotas**: cada unidade pode operar no regime **livre** (sem limite) ou **por cota** (limite mensal por especialidade/procedimento). A Secretaria de Saúde tem uma cota extra para casos prioritários/urgentes.

---

## 2. Fila de Espera — o que o sistema faz

### 2.1 Quem usa
- Recepção e triagem adicionam pacientes na fila.
- Médicos/enfermeiros veem a fila durante o atendimento.
- Administradores configuram os tempos máximos de espera.

### 2.2 Ações principais
1. **Adicionar paciente à fila**
   - Buscar paciente já cadastrado ou informar dados básicos.
   - Selecionar a unidade de destino.
   - Informar especialidade ou procedimento desejado (opcional).
   - Classificar o risco SUS: vermelho, laranja, amarelo, verde ou azul.
   - Marcar urgência: normal, prioritária ou urgente.
   - Registrar quem solicitou (nome, CNS, CBO, CNES) e observações.
   - Ao salvar, o paciente entra no final do grupo da sua classificação.

2. **Ordenação automática**
   - A fila é exibida sempre ordenada por:
     1. Classificação de risco (vermelho primeiro, azul por último).
     2. Urgência (urgente > prioritária > normal).
     3. Data/hora de entrada (mais antigo primeiro).

3. **Tempo Máximo de Espera (TME)**
   - O administrador pode definir, por unidade/especialidade/classificação, quantos dias um paciente deve esperar no máximo.
   - Quando o tempo na fila ultrapassa o TME configurado, o sistema destaca o registro em vermelho e mostra um aviso.

4. **Agendar a partir da fila**
   - Ao confirmar um agendamento para o paciente, o sistema vincula o agendamento à fila e muda o status do item para "agendado".
   - O agendamento respeita o regime de cotas da unidade escolhida.

5. **Cancelar ou remover da fila**
   - Usuários com permissão podem remover um paciente da fila, informando o motivo.
   - O registro não é apagado do histórico, apenas marcado como cancelado/removido.

### 2.3 Regras de negócio
- Um paciente pode estar em mais de uma fila ao mesmo tempo (especialidades diferentes).
- Itens "agendados" ou "cancelados" não aparecem mais na fila ativa.
- A classificação de risco vermelho deve sempre ficar no topo, independente da hora de chegada.
- Ações na fila devem ser registradas em log/auditoria quando possível.

---

## 3. Regulação Municipal — o que o sistema faz

### 3.1 Origem dos dados
- Um sistema legado (executável local) envia, via API pública, guias/encaminhamentos em lotes JSON.
- Cada guia contém dados como: número da guia, paciente, especialidade/procedimento solicitado, unidade solicitante, profissional solicitante, data do pedido, prioridade, tipo de demanda, status regulatório etc.

### 3.2 Tela de regulação
- A central de regulação vê uma lista com todos os encaminhamentos recebidos.
- Deve ser possível:
  - Buscar por nome do paciente, CPF, CNS ou número da guia.
  - Filtrar por especialidade, unidade solicitante, tipo de demanda e status.
  - Ordenar por prioridade e data de entrada.
  - Exportar a lista filtrada para CSV.

### 3.3 Ações sobre uma guia
1. **Visualizar detalhes**
   - Mostrar todos os campos da guia de forma organizada.
   - Mostrar também o JSON bruto recebido, para conferência técnica.

2. **Marcar status regulatório**
   - Exemplos de status: "Aguardando regulação", "Aprovado", "Negado", "Encaminhado", "Agendado", "Cancelado".
   - Ao aprovar/encaminhar, deve ser possível escolher a unidade de destino.

3. **Converter em agendamento**
   - Quando aprovada, a guia pode virar um agendamento na unidade escolhida.
   - O agendamento respeita as cotas da unidade destino.
   - O paciente é automaticamente cadastrado se ainda não existir.

4. **Atualização em tempo real**
   - A tela deve refletir novos encaminhamentos assim que chegam, sem precisar atualizar manualmente.

### 3.4 Regras de negócio
- Somente usuários da central de regulação podem alterar status de guias.
- Uma guia aprovada sem unidade de destino não pode ser agendada.
- O histórico de decisões da regulação deve ser preservado.

---

## 4. Cotas de Agendamento — o que o sistema faz

### 4.1 Regime da unidade
- Cada unidade pode ser configurada como:
  - **Livre**: agenda sem controle de limite mensal.
  - **Por cota**: respeita limites mensais definidos para especialidades e/ou procedimentos.

### 4.2 Tipos de cota
1. **Cota por especialidade**
   - Define, para cada unidade e competência (mês/ano), quantas vagas totais existem para uma especialidade.
   - A Secretaria de Saúde pode ter uma cota extra dentro desse total, usada para agendamentos de origem "secretaria".

2. **Cota por procedimento (SIGTAP)**
   - Define, para cada unidade e competência, quantas vagas totais existem para um procedimento específico.
   - Também pode ter cota extra da Secretaria.

### 4.3 Origem do agendamento
- Todo agendamento tem uma origem:
  - **UBS**: agendamento feito normalmente pela unidade.
  - **Secretaria**: agendamento feito pela central de regulação ou Secretaria, consumindo a cota extra.

### 4.4 Consumo de cota
- Quando um agendamento é criado em unidade "por cota", o sistema verifica se ainda há vagas disponíveis:
  - Se a origem for "secretaria", consome da cota extra da Secretaria.
  - Se a origem for "UBS", consome da cota total da unidade.
- Se não houver vagas, o agendamento é bloqueado e uma mensagem clara deve ser exibida.
- Encaixes/overbookings não devem consumir cota.

### 4.5 Tela de configuração de cotas
- O administrador escolhe a unidade e a competência.
- Pode alterar o regime (livre/cota).
- Pode lançar/editar cotas por especialidade e por procedimento.
- Deve haver indicadores visuais mostrando:
  - Total de vagas.
  - Vagas já usadas pela UBS.
  - Vagas já usadas pela Secretaria.
  - Vagas restantes.

### 4.6 Regras de negócio
- A competência sempre é o mês/ano (dia fixo, ex.: primeiro dia do mês).
- Cotas não usadas em um mês não acumulam para o mês seguinte.
- Agendamentos cancelados devem devolver a vaga à cota.
- Agendamentos de origem "secretaria" só podem ser feitos por usuários com permissão de regulação/admin.

---

## 5. Permissões — quem pode fazer o quê

### 5.1 Perfis sugeridos
- **Admin**: acesso total.
- **Recepcionista**: fila de espera, pacientes, agenda do dia, agendamentos.
- **Regulador**: regulação, cotas (visualização), agendamentos de origem Secretaria.
- **Médico/Enfermeiro**: ver agenda, fila, pacientes, realizar atendimento.

### 5.2 Módulos e ações
| Módulo | Ações mínimas necessárias |
|--------|---------------------------|
| Fila de Espera | visualizar, adicionar, editar, remover, agendar a partir da fila |
| Regulação | visualizar guias, alterar status, aprovar/negar, converter em agendamento |
| Cotas | visualizar consumo, lançar cotas, alterar regime da unidade |
| Agendamento | criar, editar, cancelar, visualizar |
| Pacientes | cadastrar, editar, visualizar |
| Unidades | visualizar, vincular usuários |

- Cada ação deve ser verificada no servidor, nunca apenas na interface.
- Usuários só podem agir nas unidades às quais estão vinculados, exceto administradores.

---

## 6. Integração com sistema legado — o que precisa funcionar

- O sistema legado envia lotes JSON para uma API pública protegida por chave de API.
- Cada lote informa de qual tabela/origem veio (ex.: ENCAMINHAMENTO, PACIENTE, AGENDAMENTO).
- A API deve aceitar, validar e armazenar os dados brutos para processamento posterior.
- A tela de regulação lê esses dados brutos e os apresenta de forma legível.
- Deve ser possível fazer upsert pela chave primária/origem, para evitar duplicatas.

---

## 7. Telas obrigatórias

1. **Fila de Espera**
   - Lista ordenada por risco/urgência.
   - Botão para adicionar paciente.
   - Botão para agendar o paciente selecionado.
   - Botão para remover/cancelar.
   - Indicadores de tempo de espera e alertas de TME estourado.

2. **Regulação / Encaminhamentos**
   - Lista de guias recebidas.
   - Filtros e busca.
   - Detalhamento completo da guia.
   - Ações de aprovar, negar, encaminhar para unidade e agendar.
   - Exportação CSV.

3. **Configuração de Cotas**
   - Seleção de unidade e competência.
   - Alteração do regime (livre/cota).
   - Lançamento de cotas por especialidade e por procedimento.
   - Indicadores de consumo (usadas UBS, usadas Secretaria, restantes).

4. **Agendamento com cota**
   - Durante o agendamento, mostrar o consumo da cota da unidade/especialidade/procedimento escolhidos.
   - Bloquear com mensagem clara quando a cota esgotar.
   - Permitir escolher a origem (UBS/Secretaria) apenas para quem tem permissão.

---

## 8. Comportamentos esperados

- A fila nunca deve perder a ordenação por risco.
- A regulação deve refletir novos dados em tempo real.
- O consumo de cotas deve ser bloqueante e verificado no servidor.
- Agendamentos cancelados devem devolver vagas.
- Encaixes não consomem cota.
- Usuários só veem e agem nas unidades permitidas.
- Toda ação sensível (aprovar guia, remover da fila, alterar cota) deve exigir permissão.

---

## 9. Checklist de entrega

- [ ] Tela de Fila de Espera funcional com ordenação por risco/urgência.
- [ ] Adicionar, agendar e remover pacientes da fila.
- [ ] Configuração de TME por unidade/especialidade/risco.
- [ ] Tela de Regulação com busca, filtros, detalhes e ações.
- [ ] API pública recebendo lotes do sistema legado.
- [ ] Tela de Configuração de Cotas (regime, especialidade, procedimento).
- [ ] Bloqueio de agendamento quando cota esgotar.
- [ ] Distinção entre origem UBS e Secretaria no consumo de cota.
- [ ] Permissões por módulo e por unidade.
- [ ] Exportação CSV na tela de regulação.
- [ ] Logs/auditoria das ações principais.
