import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Stethoscope, CalendarCog, CalendarPlus,
  CalendarDays, Building2, Settings, LogOut, MonitorPlay, ListOrdered, ShieldCheck, BarChart3, KeyRound,
  Activity, FolderPlus, UserCog, ChevronRight,
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
      { title: "Agendar Consulta", url: "/app/agendar", icon: CalendarPlus, module: "agendar" },
      { title: "Fila de Espera", url: "/app/fila", icon: ListOrdered, module: "fila" },
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
    ],
  },
  {
    key: "admin",
    title: "Administração",
    icon: ShieldCheck,
    adminOnly: true,
    items: [
      { title: "Relatórios", url: "/app/relatorios", icon: BarChart3, module: "relatorios" },
      { title: "Unidades & Especialidades", url: "/app/configuracoes", icon: Building2, module: "unidades_especialidades" },
      { title: "Configurações", url: "/app/configuracoes/sistema", icon: Settings, module: "usuarios" },
      { title: "Auditoria (LGPD)", url: "/app/auditoria", icon: ShieldCheck, module: "auditoria" },
    ],
  },
  {
    key: "conta",
    title: "Conta",
    icon: UserCog,
    items: [
      { title: "Segurança & Sessões", url: "/app/sessoes", icon: KeyRound },
    ],
  },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { profile, isAdmin, roles, can, signOut } = useAuth();
  const isActive = (u: string) => path === u || (u !== "/app" && path.startsWith(u));

  const visibleModules = modules
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
