
# Reorganização da navegação lateral

Concordo — hoje a sidebar lista 13+ links soltos, fica densa. A proposta é agrupar por **módulo**, com cada módulo expandindo para mostrar suas telas só quando clicado.

## Como vai ficar

Sidebar enxuta com 4 módulos principais (cada um vira um item clicável que expande):

```
SpokenMED
├─ ▸ Operação           (Painel, Agenda do Dia, Agendar, Fila, Painel de Chamada)
├─ ▸ Cadastros          (Pacientes, Profissionais, Agendas)
├─ ▸ Administração      (Relatórios, Unidades & Especialidades, Configurações, Auditoria)
└─ ▸ Conta              (Segurança & Sessões)
```

- Clicar no módulo **expande/recolhe** os sub-itens (accordion).
- O módulo que contém a rota atual abre automaticamente.
- Só um módulo aberto por vez (mantém a lateral leve).
- Quando a sidebar está colapsada (modo ícone), cada módulo vira um ícone único; hover/click mostra o submenu em popover.
- Filtro por permissão continua igual: módulo só aparece se o usuário tem acesso a pelo menos um item dele.

## Detalhes técnicos

- Editar `src/components/app-sidebar.tsx`:
  - Reestruturar os arrays `main`/`cadastros`/`admin`/`conta` em uma estrutura de **módulos com children**.
  - Usar `Collapsible` (`@/components/ui/collapsible`, já no projeto) dentro de `SidebarMenuItem` com `SidebarMenuSub` / `SidebarMenuSubItem` (do shadcn sidebar) para os filhos.
  - Ícones por módulo: Operação (`Activity`), Cadastros (`FolderPlus`), Administração (`ShieldCheck`), Conta (`UserCog`).
  - Estado de "qual módulo está aberto" controlado localmente (`useState`), inicializado pela rota atual via `useRouterState`.
  - Auto-expandir o módulo ativo ao navegar.
- Sem mudanças em rotas, permissões ou backend — puramente apresentação.
- Mobile bottom nav (`MobileBottomNav`) permanece como está (já é enxuto).

## Pergunta antes de implementar

Quero confirmar dois pontos:

1. **Painel de Chamada** (`/painel`) hoje está em Operação. Mantém lá ou prefere separar?
2. Quer que eu mantenha **um único módulo aberto por vez** (mais limpo) ou **vários simultaneamente** (mais flexível)?
