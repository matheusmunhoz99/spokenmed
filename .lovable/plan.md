## O que vou implementar

### 1. PDF da Agenda do Dia (por unidade)
Botão **"Exportar PDF"** no topo da tela `/app/agenda-dia` (só aparece quando há agendamentos no filtro atual). O PDF respeita os filtros já selecionados (data, unidade, profissional).

**Layout do PDF:**
- **Cabeçalho institucional**: nome da UBS (ou "Todas as Unidades"), data por extenso, total de consultas. Linha divisória.
- **Agrupado por profissional**: cada médico vira uma seção com nome + especialidade, seguido da tabela de consultas dele.
- **Colunas**: Hora · Paciente · CPF · Telefone · Status · Motivo/Obs.
- **Rodapé**: "Impresso por <nome do usuário> em DD/MM/AAAA HH:MM" + paginação "Página X de Y".

**Tecnologia:** `jsPDF` + `jspdf-autotable` (puro JS, roda no client, sem dependência Node-only). Arquivo nomeado `agenda_<ubs>_<data>.pdf`.

### 2. Comprovante PDF do agendamento
Após criar um agendamento na tela `/app/agendar`, em vez do toast simples, abrir um **diálogo de confirmação**:
> "Agendamento criado com sucesso. Deseja imprimir o comprovante?"
> [Não, obrigado] [Sim, imprimir]

Se "Sim", gera PDF de uma página com:
- Título "COMPROVANTE DE AGENDAMENTO"
- Dados do paciente (nome, CPF, telefone)
- Data/horário, profissional, especialidade, unidade, endereço
- Observações
- Rodapé com data de emissão e código do agendamento

### 3. Exportar pacientes em CSV
Botão **"Exportar CSV"** na tela `/app/pacientes` que baixa todos os pacientes visíveis (respeitando o filtro/busca atual). Colunas: nome, CPF, CNS, data nasc, sexo, telefone, email, endereço completo. Arquivo `pacientes_<data>.csv` com BOM UTF-8 (abre certo no Excel BR).

### 4. Limpeza de referências visíveis ao Lovable
- `src/routes/__root.tsx`: troca `og:image` e `twitter:image` (que apontam para preview da Lovable) por **omitir** ou usar o logo SpokenMED já existente em `src/assets/spokenmed-logo.png` (servido como URL pública).
- Remover comentários "Lovable" em `vite.config.ts` (mantendo o import do package, que é necessário pro build).
- Varredura final em `src/**` por strings "lovable" e remover qualquer texto de UI residual.

**Não posso remover (alerto, não bloqueio):**
- A dependência `@lovable.dev/vite-tanstack-config` no `package.json` — é o config do build do TanStack Start neste template; trocar quebra SSR/build.
- Headers em `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts` — esses arquivos são **auto-gerados** e a plataforma proíbe edição manual (são sobrescritos).

Esses arquivos não aparecem para o usuário final no app publicado (não vão para HTML/JSON expostos).

---

## Detalhes técnicos

**Pacotes a instalar:** `jspdf`, `jspdf-autotable` (ambos puro JS, compatíveis com a runtime atual).

**Arquivos novos:**
- `src/lib/pdf-agenda.ts` — função `gerarPdfAgenda({ data, unidade, agendamentos, agrupado, usuario })`
- `src/lib/pdf-comprovante.ts` — função `gerarComprovante({ agendamento })`
- `src/lib/csv.ts` — utilitário `downloadCsv(filename, rows, columns)`

**Arquivos editados:**
- `src/routes/app.agenda-dia.tsx` — botão Exportar PDF
- `src/routes/app.agendar.tsx` — diálogo "Imprimir comprovante?" pós-confirmação
- `src/routes/app.pacientes.tsx` — botão Exportar CSV
- `src/routes/__root.tsx` — meta tags
- `vite.config.ts` — remover comentários

**Fora de escopo (posso fazer depois se quiser):** lembrete WhatsApp, busca global Cmd+K, painel inicial com estatísticas, cancelamento com motivo+reagendamento.