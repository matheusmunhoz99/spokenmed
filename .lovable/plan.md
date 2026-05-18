## O que vou entregar

### 1. Histórico do agendamento — fim do JSON cru

Reescrever `src/components/historico-dialog.tsx` para nunca mais mostrar `{"status":"chegou"}`. Cada evento vira um card com timeline lateral:

- **Criado / Encaixe**: card com data, hora, profissional, unidade, sala, "encaixe — prioridade alta" quando aplicável (resolve nomes de `slot_id`, `profissional_id`, `unidade_id` via consultas simples).
- **Status alterado**: dois chips coloridos com seta no meio — ex.: `Em triagem → Pronto p/ consulta`, usando as mesmas cores do `StatusBadge` do app.
- **Reagendado**: bloco "de → para" com data/hora antiga e nova, profissional e unidade legíveis.
- **Cancelado**: motivo destacado.
- **Observação / outros**: texto livre.

Cada card mostra autor (quando houver `user_email`/`user_role`) e timestamp relativo ("há 5 min") com tooltip no datetime completo. Zero `<pre>`, zero `JSON.stringify`.

### 2. Triagem → liberar paciente pro médico (mais óbvio)

O fluxo já existe (`em_triagem → triado`), mas o botão está discreto. Vou:

- Em `src/routes/app.recepcao.tsx`, na coluna **"Em triagem"** do kanban: trocar o botão "Liberar" por um CTA primário verde **"Finalizar triagem"** (full-width no card, com ícone Stethoscope) e mostrar há quanto tempo está em triagem.
- Na coluna **"Prontos p/ consulta"**: card com selo "Aguardando médico há Xmin" + botão **"Chamar no painel"** direto (já existe o `onChamar`, vou destacar visualmente em verde).
- Em `src/routes/app.agenda-dia.tsx`, na linha do paciente em `em_triagem` mostrar o botão **"Finalizar triagem"** (label visível, não só ícone) pra enfermagem/recepção que estiver na agenda também conseguir liberar.
- Tooltip no botão "Atender" do médico quando bloqueado: já existe, vou reforçar a cor (âmbar) + ícone de relógio pra ficar claro que é só esperar a triagem.

### 3. Painel de chamada — bloqueio defensivo

Em `src/components/chamar-dialog.tsx`, recusar abrir/chamar quando `status === 'em_triagem'` com toast "Paciente ainda está em triagem". Evita chamada acidental.

### 4. Polimento visual da Recepção

- KPIs com gradientes sutis por tom (sky/violet/emerald/amber), número grande, ícone com bg translúcido.
- Cards do kanban: nome do paciente em destaque, linha 2 com idade • profissional • horário, badge de tempo de espera com cor dinâmica (verde <15min, âmbar <30min, vermelho ≥30min).
- Header da página com chip "Atualizado agora" + botão refresh manual.
- Tabela detalhada: zebra striping, hover, sticky header, badge de status com ícone.

### 5. Pequenos toques

- Banner "X paciente(s) pronto(s) pra você" no topo da agenda do médico vira card com gradiente verde + botão "Ver primeiro" que rola até a linha.
- Card de paciente em `triado` na agenda-dia ganha glow verde suave (`ring-emerald-500/40`) pra chamar atenção do médico.

## Arquivos tocados

- `src/components/historico-dialog.tsx` (reescrita)
- `src/routes/app.recepcao.tsx` (kanban e tabela)
- `src/routes/app.agenda-dia.tsx` (botões + banner)
- `src/components/chamar-dialog.tsx` (guarda contra `em_triagem`)

Sem migrations novas — o status `triado` e o gatilho `fn_ag_carimbos` já estão no banco.
