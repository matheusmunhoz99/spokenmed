export type ModuleKey =
  | "agenda_dia"
  | "agendar"
  | "fila"
  | "recepcao"
  | "pacientes"
  | "profissionais"
  | "agendas"
  | "painel"
  | "unidades_especialidades"
  | "usuarios"
  | "relatorios"
  | "auditoria"
  | "triagem"
  | "visitas"
  | "domicilios"
  | "cotas"
  | "secretaria_agendar"
  | "assinaturas";

export type AppRole = "admin" | "recepcionista" | "medico" | "triagem" | "acs";

export const MODULES: { key: ModuleKey; label: string; manageable: boolean }[] = [
  { key: "agenda_dia", label: "Agenda do dia", manageable: true },
  { key: "agendar", label: "Agendar consulta", manageable: true },
  { key: "fila", label: "Fila de Espera", manageable: true },
  { key: "recepcao", label: "Recepção do dia", manageable: true },
  { key: "triagem", label: "Triagem (Classificação de Risco)", manageable: true },
  { key: "visitas", label: "Visitas Domiciliares (ACS)", manageable: true },
  { key: "domicilios", label: "Cadastro Domiciliar (CDS)", manageable: true },
  { key: "pacientes", label: "Pacientes", manageable: true },
  { key: "profissionais", label: "Profissionais", manageable: true },
  { key: "agendas", label: "Agendas (configuração)", manageable: true },
  { key: "painel", label: "Painel de Chamada", manageable: true },
  { key: "unidades_especialidades", label: "Unidades & Especialidades", manageable: true },
  { key: "usuarios", label: "Usuários do sistema", manageable: true },
  { key: "cotas", label: "Cotas de agendamento", manageable: true },
  { key: "assinaturas", label: "Assinatura digital de PDF", manageable: true },
  { key: "secretaria_agendar", label: "Agendar como Secretaria (urgência)", manageable: true },
  { key: "relatorios", label: "Relatórios & Dashboards", manageable: false },
  { key: "auditoria", label: "Auditoria (LGPD)", manageable: false },
];

export type PermRow = { module: ModuleKey; can_view: boolean; can_manage: boolean };

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  recepcionista: "Administrativo",
  medico: "Médico",
  triagem: "Triagem",
  acs: "Agente Comunitário de Saúde",
};

export function defaultPermsFor(role: AppRole): PermRow[] {
  if (role === "admin") {
    return MODULES.map((m) => ({ module: m.key, can_view: true, can_manage: true }));
  }
  if (role === "medico") {
    return MODULES.map((m) => ({
      module: m.key,
      can_view: m.key === "agenda_dia" || m.key === "pacientes" || m.key === "recepcao" || m.key === "assinaturas",
      can_manage: m.key === "assinaturas",
    }));
  }
  if (role === "triagem") {
    return MODULES.map((m) => {
      if (m.key === "triagem" || m.key === "fila" || m.key === "recepcao" || m.key === "pacientes") {
        return { module: m.key, can_view: true, can_manage: true };
      }
      if (m.key === "agenda_dia" || m.key === "painel") {
        return { module: m.key, can_view: true, can_manage: false };
      }
      return { module: m.key, can_view: false, can_manage: false };
    });
  }
  if (role === "acs") {
    return MODULES.map((m) => {
      if (m.key === "visitas" || m.key === "domicilios") return { module: m.key, can_view: true, can_manage: true };
      if (m.key === "pacientes") return { module: m.key, can_view: true, can_manage: true };
      return { module: m.key, can_view: false, can_manage: false };
    });
  }
  // administrativo (recepcionista)
  return MODULES.map((m) => {
    if (m.key === "agenda_dia" || m.key === "agendar" || m.key === "fila" || m.key === "pacientes" || m.key === "painel" || m.key === "recepcao") {
      return { module: m.key, can_view: true, can_manage: true };
    }
    if (m.key === "profissionais" || m.key === "agendas") {
      return { module: m.key, can_view: true, can_manage: false };
    }
    return { module: m.key, can_view: false, can_manage: false };
  });
}
