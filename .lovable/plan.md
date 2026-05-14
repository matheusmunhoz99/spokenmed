## 1. Espaçamento PDF — sem sobreposição

Hoje todo conteúdo (cards, tabela, lembretes) usa `pageH - 50` como bottom; o rodapé ocupa de `pageH - 40` até a borda, então com agendas de muitas linhas o autoTable encosta na linha do rodapé e o "Emitido por" sobrepõe a "SpokenMED".

Mudanças em `src/lib/pdf-shared.ts`:
- **Rodapé em duas linhas**: linha 1 (acima da régua) com mini-logo + nome SpokenMED à esquerda; linha 2 (abaixo) com `Emitido por … · data` ao centro e `Página X de Y` à direita. Isso elimina a colisão lateral central×esquerda em nomes longos.
- Constante exportada `PDF_FOOTER_MARGIN = 64` (era 50). Régua sobe para `pageH - 56`, logo em `pageH - 46`, texto em `pageH - 22`.
- `drawHeader` ganha pequeno padding inferior extra (retorna `headerH + 10` em vez de `+4`) para a primeira faixa do conteúdo respirar.

Mudanças em `pdf-agenda.ts` e `pdf-comprovante.ts`:
- Importar `PDF_FOOTER_MARGIN` e usá-lo em todos os checks `if (y > pageH - …)` e em `autoTable.margin.bottom`.
- Em `pdf-agenda.ts`, antes de cada bloco de profissional, garantir altura mínima de 70pt restante (faixa do prof + cabeçalho da tabela + 1 linha) antes de quebrar página, evitando faixa órfã.
- Em `pdf-comprovante.ts`, se o card de "Lembretes" não couber, `addPage()` antes de desenhar.

## 2. Excluir agendamento na Agenda do Dia (admin)

Em `src/routes/app.agenda-dia.tsx`:
- Adicionar nova coluna "Ações" na tabela com botão `Trash2` (ghost, vermelho) **somente quando `isAdmin`**.
- Ao clicar abre `AlertDialog` de confirmação ("Excluir agendamento de {paciente} às {hora}? Esta ação libera o horário.").
- Mutation: `delete from agendamentos where id=?` + `update slots set status='livre' where id=slot_id`. RLS já permite (`ag_admin_all`).
- Após sucesso: invalidar query da agenda + toast.

## 3. Painel de Chamada com voz

### Banco de dados (uma migration)

```sql
-- coluna sala padrão por profissional (opcional)
alter table profissionais add column sala text;

-- registro de chamadas
create table public.chamadas (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null,
  unidade_id uuid not null,
  paciente_nome text not null,
  profissional_nome text,
  sala text,
  chamado_por uuid,
  chamado_em timestamptz not null default now()
);
alter table public.chamadas enable row level security;

-- admin tudo; staff só da sua unidade
create policy ch_admin_all on public.chamadas for all to authenticated
  using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create policy ch_staff_rw on public.chamadas for all to authenticated
  using (is_authenticated_staff(auth.uid()) and user_can_access_unidade(auth.uid(), unidade_id))
  with check (is_authenticated_staff(auth.uid()) and user_can_access_unidade(auth.uid(), unidade_id));

-- realtime
alter publication supabase_realtime add table public.chamadas;
alter table public.chamadas replica identity full;
```

### Fluxo da recepcionista (Agenda do Dia)

- Botão `Megaphone` "Chamar" em cada linha (ao lado de status), **se `unidade_id` estiver definido na linha**.
- Ao clicar abre `Dialog` "Chamar paciente" com:
  - Paciente / profissional (read-only)
  - Campo "Sala" pré-preenchido com `profissionais.sala` (editável)
  - Botão "Chamar agora"
- Insere em `chamadas` com `unidade_id` do slot, snapshot do nome, sala digitada e `chamado_por = auth.uid()`. A própria página da recepção também emite uma prévia de fala via `speechSynthesis` para confirmação ("Ok, paciente chamado").

### Painel TV — `src/routes/app.painel.tsx`

- Rota autenticada (sob `_app/protected layout` já existente).
- Seletor de **Unidade** no topo (filtra unidades acessíveis ao usuário; admin vê todas). Persiste a escolha em `localStorage`.
- Botão "Tela cheia" (Fullscreen API) e botão "Ativar som" (necessário pra desbloquear `speechSynthesis` em alguns browsers — mostra um overlay "Toque para ativar" antes do primeiro áudio).
- Layout TV-friendly:
  - Bloco gigante centralizado com **última chamada**: nome do paciente (text-7xl), "Dirija-se à **Sala X**" (text-5xl), profissional em chip teal, hora hh:mm.
  - Lateral direita lista as 5 chamadas anteriores (nome menor + sala + horário).
  - Background gradiente teal escuro do site, animação sutil de fade/slide quando entra nova chamada.
- Subscription Realtime: `supabase.channel('chamadas-painel').on('postgres_changes', { event:'INSERT', schema:'public', table:'chamadas', filter:'unidade_id=eq.<id>' }, ...)`.
- A cada novo INSERT: empurra para o topo da lista, dispara `speechSynthesis.speak(new SpeechSynthesisUtterance("Paciente {nome}, dirija-se à sala {sala}"))` com voz `pt-BR` (escolhe primeira voz `pt*` disponível). Repete a frase 2× com 800ms de intervalo + bip curto via `AudioContext` antes da fala pra chamar atenção.
- Acessibilidade: aria-live="assertive" no bloco principal.

### Permissões

- Adicionar módulo `"painel"` em `src/lib/permissions.ts` (label "Painel de Chamada").
- Reutilizar `can(module, "view")` para mostrar item no menu lateral.
- Item de menu "Painel" no `app-sidebar.tsx` com ícone `MonitorPlay`.

### Configuração rápida da sala do profissional

- Em `src/routes/app.profissionais.tsx`: adicionar input "Sala padrão" no form de edição (texto curto). Sem mudança no fluxo de cadastro.

## Arquivos

**Novos:**
- `supabase/migrations/<timestamp>_chamadas_painel.sql`
- `src/routes/app.painel.tsx`
- `src/components/chamar-dialog.tsx`

**Editados:**
- `src/lib/pdf-shared.ts`, `src/lib/pdf-agenda.ts`, `src/lib/pdf-comprovante.ts` — espaçamentos
- `src/routes/app.agenda-dia.tsx` — coluna Ações (excluir + chamar)
- `src/routes/app.profissionais.tsx` — campo sala
- `src/components/app-sidebar.tsx` + `src/components/mobile-bottom-nav.tsx` — item Painel
- `src/lib/permissions.ts` — módulo painel
- `src/integrations/supabase/types.ts` — gerado automaticamente após migração

Sem mudanças em auth ou clientes Supabase. Tudo via cliente do navegador respeitando RLS já existente + nova policy.
