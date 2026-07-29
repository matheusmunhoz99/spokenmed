import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Stethoscope, CalendarCog, CalendarPlus,
  CalendarDays, Building2, Settings, LogOut, MonitorPlay, ListOrdered, ShieldCheck, BarChart3, KeyRound,
  Activity, FolderPlus, UserCog, ChevronRight, History, ClipboardList, HeartPulse, Home, FileDown, FileSignature, BedDouble, Network,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import logo from "@/assets/spokenmed-logo.png";
import type { ModuleKey } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/permissions";

type Item = { title: string; url: string; icon: any; module?: ModuleKey };
type Module = { key: string; title: string; icon: any; items: Item[]; adminOnly?: boolean };

const modules: Module[] = [
  {
    key: "operacao",
    title: "Operação",
    icon: Activity,
    items: [
      { title: "Painel", url: "/app", icon: LayoutDashboard },
      { title: "Agenda do Dia", url: "/app/agenda-dia", icon: CalendarDays, module: "agenda_dia" },
      { title: "Recepção", url: "/app/recepcao", icon: ClipboardList, module: "recepcao" },
      { title: "Triagem", url: "/app/triagem", icon: HeartPulse, module: "triagem" },
      { title: "Visitas Domiciliares", url: "/app/visitas", icon: Home, module: "visitas" },
      { title: "Cadastro Domiciliar", url: "/app/domicilios", icon: Home, module: "domicilios" },
      { title: "Agendar Consulta", url: "/app/agendar", icon: CalendarPlus, module: "agendar" },
      { title: "Fila de Espera", url: "/app/fila", icon: ListOrdered, module: "fila" },
      { title: "Leitos & Internações", url: "/app/leitos", icon: BedDouble, module: "leitos" },
      { title: "Encaminhamentos / Regulação", url: "/app/encaminhamentos", icon: Network, module: "regulacao" },
      { title: "Painel de Chamada", url: "/painel", icon: MonitorPlay, module: "painel" },
    ],
  },
  {
    key: "cadastros",
    title: "Cadastros",
    icon: FolderPlus,
    items: [
      { title: "Pacientes", url: "/app/pacientes", icon: Users, module: "pacientes" },
      { title: "Profissionais", url: "/app/profissionais", icon: Stethoscope, module: "profissionais" },
      { title: "Agendas", url: "/app/agendas", icon: CalendarCog, module: "agendas" },
      { title: "Assinatura Digital", url: "/app/assinaturas", icon: FileSignature, module: "assinaturas" },
    ],
  },
  {
    key: "admin",
    title: "Administração",
    icon: ShieldCheck,
    adminOnly: true,
    items: [
      { title: "Relatórios", url: "/app/relatorios", icon: BarChart3, module: "relatorios" },
      { title: "Exportar e-SUS PEC", url: "/app/exportar-esus", icon: FileDown },
      { title: "Cadastros & Configurações", url: "/app/cadastros", icon: Settings, module: "unidades_especialidades" },
      { title: "Auditoria (LGPD)", url: "/app/auditoria", icon: ShieldCheck, module: "auditoria" },
    ],
  },
  {
    key: "conta",
    title: "Conta",
    icon: UserCog,
    items: [
      { title: "Meu Perfil", url: "/app/meu-perfil", icon: UserCog },
      { title: "Segurança & Sessões", url: "/app/sessoes", icon: KeyRound },
    ],
  },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { profile, isAdmin, roles, can, signOut, user } = useAuth();
  const isActive = (u: string) => path === u || (u !== "/app" && path.startsWith(u));

  const isMedicoSimulado = user?.email === "admin@opportunity.com";
  const modulesWithMedico: Module[] = isMedicoSimulado
    ? modules.map((m) =>
        m.key === "operacao"
          ? { ...m, items: [...m.items, { title: "Histórico de Atendimentos", url: "/app/historico-atendimentos", icon: History }] }
          : m
      )
    : modules;

  const visibleModules = modulesWithMedico
    .filter((m) => !m.adminOnly || isAdmin)
    .map((m) => ({ ...m, items: m.items.filter((i) => !i.module || can(i.module, "view")) }))
    .filter((m) => m.items.length > 0);

  const activeModuleKey = visibleModules.find((m) => m.items.some((i) => isActive(i.url)))?.key
    ?? visibleModules[0]?.key
    ?? null;

  const [openKey, setOpenKey] = useState<string | null>(activeModuleKey);

  useEffect(() => {
    const k = visibleModules.find((m) => m.items.some((i) => isActive(i.url)))?.key;
    if (k) setOpenKey(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const role = roles[0] ?? "recepcionista";
  const roleLabel = ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? "Usuário";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-3">
          <img src={logo} alt="SpokenMED" className="h-11 w-11 shrink-0 object-contain drop-shadow-md" />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-sidebar-foreground">SpokenMED</span>
            <span className="text-[11px] text-sidebar-foreground/60">Secretaria de Saúde</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleModules.map((mod) => {
                const isOpen = openKey === mod.key;
                const hasActive = mod.items.some((i) => isActive(i.url));
                return (
                  <Collapsible
                    key={mod.key}
                    open={isOpen}
                    onOpenChange={(o) => setOpenKey(o ? mod.key : null)}
                    asChild
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={hasActive && !isOpen}
                          tooltip={mod.title}
                          className="group/mod"
                        >
                          <mod.icon />
                          <span>{mod.title}</span>
                          <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/mod:rotate-90 group-data-[collapsible=icon]:hidden" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {mod.items.map((item) => (
                            <SidebarMenuSubItem key={item.url}>
                              <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
                                <Link to={item.url}>
                                  <item.icon /> <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2 text-sidebar-foreground">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-medium">{profile?.nome ?? "Usuário"}</div>
            <div className="truncate text-[11px] text-sidebar-foreground/60">{roleLabel}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => signOut()} className="text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
