import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Stethoscope, CalendarCog, CalendarPlus,
  CalendarDays, Building2, Settings, LogOut, HeartPulse,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

const main = [
  { title: "Painel", url: "/app", icon: LayoutDashboard },
  { title: "Agenda do Dia", url: "/app/agenda-dia", icon: CalendarDays },
  { title: "Agendar Consulta", url: "/app/agendar", icon: CalendarPlus },
];
const cadastros = [
  { title: "Pacientes", url: "/app/pacientes", icon: Users },
  { title: "Profissionais", url: "/app/profissionais", icon: Stethoscope },
  { title: "Agendas", url: "/app/agendas", icon: CalendarCog },
];
const admin = [
  { title: "Unidades & Especialidades", url: "/app/configuracoes", icon: Building2 },
  { title: "Configurações", url: "/app/configuracoes/sistema", icon: Settings },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { profile, isAdmin, signOut } = useAuth();
  const isActive = (u: string) => path === u || (u !== "/app" && path.startsWith(u));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-sidebar-foreground">SpokenMed</span>
            <span className="text-[11px] text-sidebar-foreground/60">Secretaria de Saúde</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((item) => (
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

        <SidebarGroup>
          <SidebarGroupLabel>Cadastros</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {cadastros.map((item) => (
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

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {admin.map((item) => (
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
            <div className="truncate text-[11px] text-sidebar-foreground/60">
              {isAdmin ? "Administrador" : "Recepcionista"}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => signOut()} className="text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
