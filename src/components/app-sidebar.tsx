import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Stethoscope, CalendarCog, CalendarPlus,
  CalendarDays, Building2, Settings, LogOut, MonitorPlay,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import logo from "@/assets/spokenmed-logo.png";
import type { ModuleKey } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/permissions";

type Item = { title: string; url: string; icon: any; module?: ModuleKey };

const main: Item[] = [
  { title: "Painel", url: "/app", icon: LayoutDashboard },
  { title: "Agenda do Dia", url: "/app/agenda-dia", icon: CalendarDays, module: "agenda_dia" },
  { title: "Agendar Consulta", url: "/app/agendar", icon: CalendarPlus, module: "agendar" },
  { title: "Painel de Chamada", url: "/painel", icon: MonitorPlay, module: "painel" },
];
const cadastros: Item[] = [
  { title: "Pacientes", url: "/app/pacientes", icon: Users, module: "pacientes" },
  { title: "Profissionais", url: "/app/profissionais", icon: Stethoscope, module: "profissionais" },
  { title: "Agendas", url: "/app/agendas", icon: CalendarCog, module: "agendas" },
];
const admin: Item[] = [
  { title: "Unidades & Especialidades", url: "/app/configuracoes", icon: Building2, module: "unidades_especialidades" },
  { title: "Configurações", url: "/app/configuracoes/sistema", icon: Settings, module: "usuarios" },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { profile, isAdmin, roles, can, signOut } = useAuth();
  const isActive = (u: string) => path === u || (u !== "/app" && path.startsWith(u));

  const filter = (items: Item[]) => items.filter((i) => !i.module || can(i.module, "view"));

  const mainVisible = filter(main);
  const cadastrosVisible = filter(cadastros);
  const adminVisible = isAdmin ? admin : [];

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
        {mainVisible.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Operação</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainVisible.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url}>
                        <item.icon /> <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {cadastrosVisible.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Cadastros</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {cadastrosVisible.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url}>
                        <item.icon /> <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {adminVisible.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminVisible.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url}>
                        <item.icon /> <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2 text-sidebar-foreground">
          <div className="min-w-0 flex-1">
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
