## Objetivo

Ajustar a barra de navegação inferior (mobile) em `src/components/mobile-bottom-nav.tsx` para mostrar apenas os itens relevantes a cada perfil — Triagem e Visitas só aparecem para quem realmente usa.

## Regras por perfil

| Perfil | Itens da barra inferior |
|---|---|
| **Admin** | Início, Agenda, Recepção, Agendar, Pacientes, Menu (sem Triagem, sem Visitas) |
| **Médico** | Início, Agenda, Recepção, Agendar, Pacientes, Menu |
| **Enfermeiro (Triagem)** | Início, Agenda, Recepção, Triagem, Agendar, Pacientes, Menu |
| **ACS (Agente de Saúde)** | Início, Visitas, Pacientes, Menu |
| **Recepcionista** (mantém comportamento atual baseado em permissões) | Início, Agenda, Recepção, Agendar, Pacientes, Menu |

O botão **Menu** continua sempre presente (abre o sidebar com o resto das opções).

## Mudanças técnicas

Arquivo único: `src/components/mobile-bottom-nav.tsx`

1. Importar os flags `isAdmin`, `isMedico`, `isTriagem`, `isAcs` do `useAuth()` (já existem no hook).
2. Substituir o filtro atual `allItems.filter((it) => !it.module || can(it.module, "view"))` por uma função `pickItemsForRole()` que retorna a lista exata conforme a tabela acima:
   - **ACS** (`isAcs && !isAdmin`): apenas `Início`, `Visitas`, `Pacientes`.
   - **Triagem/Enfermeiro** (`isTriagem && !isAdmin`): `Início`, `Agenda`, `Recepção`, `Triagem`, `Agendar`, `Pacientes`.
   - **Admin**: `Início`, `Agenda`, `Recepção`, `Agendar`, `Pacientes` (oculta Triagem e Visitas explicitamente, mesmo que `can()` permita).
   - **Médico / Recepcionista / outros**: `Início`, `Agenda`, `Recepção`, `Agendar`, `Pacientes`, filtrando por `can(module, "view")` para respeitar permissões customizadas.
3. Manter o item `Fila` fora da barra inferior em todos os casos (já não está nas listas pedidas) — continua acessível pelo Menu lateral.
4. Não mexer no sidebar desktop (`app-sidebar.tsx`) — o pedido é específico para a barra de baixo ("la em baixo").

## Fora de escopo

- Permissões do banco / RLS — sem alterações.
- Sidebar desktop — sem alterações.
- Rotas e telas de Triagem/Visitas — continuam acessíveis aos perfis corretos.
