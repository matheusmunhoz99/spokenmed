export type ModuleKey =
  | "agenda_dia"
  | "agendar"
  | "fila"
  | "pacientes"
  | "profissionais"
  | "agendas"
  | "painel"
  | "unidades_especialidades"
  | "usuarios"
  | "auditoria";

export type AppRole = "admin" | "recepcionista" | "medico";

export const MODULES: { key: ModuleKey; label: string; manageable: boolean }[] = [
  { key: "agenda_dia", label: "Agenda do dia", manageable: true },
  { key: "agendar", label: "Agendar consulta", manageable: true },
  { key: "fila", label: "Fila de Espera", manageable: true },
  { key: "pacientes", label: "Pacientes", manageable: true },
  { key: "profissionais", label: "Profissionais", manageable: true },
  { key: "agendas", label: "Agendas (configuração)", manageable: true },
  { key: "painel", label: "Painel de Chamada", manageable: true },
  { key: "unidades_especialidades", label: "Unidades & Especialidades", manageable: true },
  { key: "usuarios", label: "Usuários do sistema", manageable: true },
];

export type PermRow = { module: ModuleKey; can_view: boolean; can_manage: boolean };

/** "Recepcionista" é exibido como "Administrativo" na UI. */
export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  recepcionista: "Administrativo",
  medico: "Médico",
};

export function defaultPermsFor(role: AppRole): PermRow[] {
  if (role === "admin") {
    return MODULES.map((m) => ({ module: m.key, can_view: true, can_manage: true }));
  }
  if (role === "medico") {
    return MODULES.map((m) => ({
      module: m.key,
      can_view: m.key === "agenda_dia" || m.key === "pacientes",
      can_manage: false,
    }));
  }
  // administrativo (recepcionista)
  return MODULES.map((m) => {
    if (m.key === "agenda_dia" || m.key === "agendar" || m.key === "fila" || m.key === "pacientes" || m.key === "painel") {
      return { module: m.key, can_view: true, can_manage: true };
    }
    if (m.key === "profissionais" || m.key === "agendas") {
      return { module: m.key, can_view: true, can_manage: false };
    }
    return { module: m.key, can_view: false, can_manage: false };
  });
}
