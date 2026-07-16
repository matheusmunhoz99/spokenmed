
## Objetivo
Hoje a tela `/app/configuracoes` empilha Unidades, Especialidades, Equipes e Procedimentos numa página só, enquanto Profissionais, Cotas e Sistema estão em rotas soltas. A ideia é criar um **hub único e organizado** com navegação por abas, cada cadastro na sua própria página, mantendo tudo o que já existe funcionando.

## Nova estrutura de navegação

Sidebar (agrupamento "Administração") passa a ter só **um item** chamado **"Cadastros & Configurações"** apontando para `/app/cadastros`. Dentro dele, um layout com abas horizontais (estilo shadcn `Tabs` + `Link`) leva a cada seção:

```text
/app/cadastros
 ├── /unidades           (UBS, postos, hospitais)
 ├── /especialidades     (especialidades médicas)
 ├── /equipes            (eSF/eAP com INE)
 ├── /procedimentos      (SIGTAP)
 ├── /profissionais      (move da rota atual)
 ├── /cotas              (move de /configuracoes/cotas)
 ├── /usuarios           (move de /configuracoes/sistema)
 └── /auditoria          (atalho para /app/auditoria — opcional, ou fica solto)
```

Cada aba é uma rota-filho independente, com título próprio no header, breadcrumb simples ("Cadastros › Unidades") e botão de ação primário fixo no topo direito ("Nova unidade", "Novo profissional", etc.).

## Melhorias visuais por página

- **Página-índice `/app/cadastros`**: grid de cards (um por seção) com ícone, título, descrição curta e contador (ex.: "12 unidades ativas"). Serve de landing quando o admin entra sem escolher aba.
- **Unidades**: extrair o formulão de 10 campos para um `Dialog` "Nova unidade" (como já é em Profissionais), deixando a página só com a tabela + busca + filtro ativo/inativo + botão importar CSV.
- **Especialidades**: página enxuta com input inline + lista/chips, busca por nome.
- **Equipes**: manter o form compacto mas em `Dialog`, tabela com filtro por unidade.
- **Procedimentos**: tabela com busca por código/nome, botão "Novo" em dialog, importar CSV mantido.
- **Profissionais**: mantém o dialog atual, apenas passa a viver sob `/app/cadastros/profissionais`.
- **Cotas**: idem, movida para `/app/cadastros/cotas`.
- **Usuários (Sistema)**: idem, movida para `/app/cadastros/usuarios`.

Header de cada aba usa o mesmo padrão: título grande + descrição curta + ação primária à direita, seguido do conteúdo. Espaçamento consistente (`space-y-4`, cards `rounded-lg border bg-card`).

## Detalhes técnicos

- Nova rota-layout `src/routes/app.cadastros.tsx` renderizando `<Outlet />` com barra de abas (usando `Link` do TanStack e `useRouterState` pra marcar ativo).
- Novas rotas-filhas: `app.cadastros.index.tsx`, `app.cadastros.unidades.tsx`, `app.cadastros.especialidades.tsx`, `app.cadastros.equipes.tsx`, `app.cadastros.procedimentos.tsx`.
- Mover conteúdo: `app.profissionais.tsx` → `app.cadastros.profissionais.tsx`; `app.configuracoes.cotas.tsx` → `app.cadastros.cotas.tsx`; `app.configuracoes.sistema.tsx` → `app.cadastros.usuarios.tsx`. As rotas antigas viram redirects (`beforeLoad` → `throw redirect`) pra não quebrar links salvos.
- Extrair os 4 cards atuais de `app.configuracoes.tsx` em componentes reutilizáveis (`UnidadesTable`, `EspecialidadesList`, `EquipesTable`, `ProcedimentosTable`) sob `src/components/cadastros/`, e envolver os formulários em `Dialog`s dedicados.
- Sidebar (`app-sidebar.tsx`): substituir os 3 itens ("Unidades & Especialidades", "Cotas", "Configurações") por um único **"Cadastros & Configurações"** → `/app/cadastros`. "Profissionais" e "Agendas" continuam onde estão em "Cadastros" da sidebar (ou também consolidamos — ver pergunta abaixo).
- Guards: cada rota-filha usa `can(...)` do jeito atual; a barra de abas esconde as abas sem permissão.
- Títulos em `app.tsx` (mapa `titles`) atualizados.
- **Sem** alteração de schema/DB, **sem** alteração de lógica de negócio (agendamento, cotas, permissões). Só reorganização visual/rotas.

## Ponto a decidir antes de implementar

Uma dúvida: "Profissionais" e "Agendas" (que hoje ficam no grupo "Cadastros" da sidebar, fora de Administração) devem entrar também nas abas do hub `/app/cadastros`, ou continuam como itens diretos na sidebar? Minha sugestão é **entrar no hub** (fica tudo num lugar só, como você pediu), mas se preferir manter atalho direto na sidebar pra Profissionais/Agendas eu deixo os dois caminhos.
