## Objetivo
Transformar o Painel de Chamada em uma página dedicada, em tela cheia, sem a barra lateral nem o cabeçalho do `/app`, ainda exigindo login e a permissão `painel`.

## Mudanças

### 1. Nova rota top-level `/painel` (fora do layout `/app`)
Criar `src/routes/painel.tsx`:
- `createFileRoute("/painel")` — não herda o `AppLayout` (sem sidebar/header).
- `beforeLoad`: aguarda `supabase.auth.getUser()`; se não logado, `redirect({ to: "/login", search: { redirect: "/painel" } })`.
- Componente `PainelFullscreen`:
  - Usa `useAuth()` para checar `can("painel")`. Se não tiver acesso, mostra `<SemAcesso />` centralizado.
  - Usa `useAllowedUnidades()` para listar as unidades do usuário logado.
  - Lê/grava unidade selecionada em `localStorage` (`painel_unidade_id`).
  - Carga inicial das últimas chamadas + subscription Realtime em `chamadas` filtrada por `unidade_id`.
  - Voz (`speechSynthesis`) com bip + repetição, igual ao atual. Botão "Ativar som" obrigatório (autoplay policy).
  - Botão "Tela cheia" (`requestFullscreen` no container raiz).
  - Botão "Sair do painel" → `navigate({ to: "/app" })`.
  - Mostra no rodapé o usuário logado (nome) e a unidade ativa.

### 2. Layout fullscreen
- Container `min-h-screen w-screen` com gradiente `from-primary via-primary to-[hsl(180_70%_18%)]`.
- Top bar fixa translúcida com: logo + "Painel de Chamada" + select de unidade + botões (som, tela cheia, sair).
- Bloco principal central: "PRÓXIMO PACIENTE" + nome `text-7xl/9xl` + "Sala X" em chip grande, animação de entrada.
- Sidebar à direita: últimas 5 chamadas com hora.
- Relógio grande no canto superior direito (atualiza a cada 1s).
- `aria-live="assertive"` no bloco principal.

### 3. Remover a versão antiga dentro de `/app`
- Deletar `src/routes/app.painel.tsx` (a antiga ficava com sidebar).
- Atualizar `src/components/app-sidebar.tsx` e `src/components/mobile-bottom-nav.tsx`: o link "Painel de Chamada" agora aponta para `/painel` (com `target="_blank"` opcional para abrir em nova aba na TV — confirmar abaixo).

### 4. Validação
- Permissão `painel` já existe em `src/lib/permissions.ts` — manter.
- RLS de `chamadas` já permite SELECT/INSERT por `user_can_access_unidade` — sem alteração de banco.
- Testar:
  - Usuário sem permissão → `<SemAcesso />`.
  - Usuário sem unidades vinculadas → mensagem "Sem unidade disponível".
  - Inserir uma chamada via `chamar-dialog` em outra aba → painel atualiza em tempo real e fala.
  - F11 / botão tela cheia funciona.

## Arquivos
- **Criar**: `src/routes/painel.tsx`
- **Editar**: `src/components/app-sidebar.tsx`, `src/components/mobile-bottom-nav.tsx`
- **Deletar**: `src/routes/app.painel.tsx`

## Pergunta rápida
O link "Painel de Chamada" na sidebar deve abrir em **nova aba** (`target="_blank"`) — útil pra deixar a TV num monitor separado — ou navegar normalmente na mesma aba?