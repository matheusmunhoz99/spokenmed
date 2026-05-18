## Plano

### 1) Notificação em tempo real pro médico quando paciente fica "triado"

**`src/routes/app.agenda-dia.tsx`** — adicionar canal realtime:
- `useEffect` cria `supabase.channel("agenda-dia-realtime")` com `postgres_changes` (event UPDATE, table `agendamentos`, filter `profissional_id=eq.{meuProf}` para médicos, ou sem filter para admin).
- Em qualquer mudança: `qc.invalidateQueries(["agenda-dia", ...])`.
- Quando `payload.new.status === "triado"` e `old.status !== "triado"`:
  - `toast.success("Paciente pronto pra consulta", { description: nome, action: "Atender" })` — clique abre `ConsultorioDialog` direto.
  - Tocar bipe curto (`new Audio` com data-uri) e piscar o título do navegador `document.title` por 5s ("● Paciente pronto").
  - Badge contador no header da agenda (já existe banner verde — agora incrementado em tempo real sem reload).

Limpeza no unmount: `supabase.removeChannel(ch)`.

### 2) Botão "Finalizar e enviar ao eSUS" mais visível no mobile

Status atual em `src/components/consultorio/consultorio-dialog.tsx`:
- Header: botão visível só em `sm:inline-flex` (≥640px).
- Mobile: existe barra fixa no rodapé (linha 883) com "Salvar" + "Finalizar e enviar", mas é `sticky bottom-0` dentro do dialog — em alguns Androids o dialog rola junto e a barra "some" atrás do teclado/URL bar.

Mudanças:
- Trocar `sticky` por `fixed bottom-0 inset-x-0` com `z-50` quando em mobile, garantindo que sempre apareça acima do conteúdo.
- Aumentar altura/peso visual: botão "Finalizar" `size="lg"`, gradiente primário, ícone `Send`, texto "Finalizar e enviar ao eSUS".
- Adicionar safe-area inset (`pb-[max(0.75rem,env(safe-area-inset-bottom))]`) — já existe, manter.
- Adicionar `pb-24 sm:pb-0` no container de conteúdo do dialog pra não esconder o último campo atrás da barra fixa.
- No header desktop, deixar "Finalizar e enviar ao eSUS PEC" com cor primária sólida + ícone destacado (hoje é só primário padrão, pode passar despercebido).
- Adicionar atalho visível: pequeno hint "Ctrl+Enter" abaixo do botão no desktop.

### 3) Polimento mobile geral do consultório

- Tabs com scroll horizontal já existe; garantir que `tab-atendimento.tsx` e `tab-conduta.tsx` tenham padding inferior `pb-4` pra não colar na barra fixa.
- Botão "Salvar" no mobile fica menor (`size="default"`), "Finalizar" ocupa `flex-1` (já está).

### Arquivos tocados
- `src/routes/app.agenda-dia.tsx` — canal realtime + toast/som/título piscando.
- `src/components/consultorio/consultorio-dialog.tsx` — barra de ação fixa reforçada, padding bottom no conteúdo, destaque visual do "Finalizar".

Sem migrações novas (realtime para `agendamentos` já está habilitado).