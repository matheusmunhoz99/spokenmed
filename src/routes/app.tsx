import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/app")({ component: AppLayout });

const titles: Record<string, string> = {
  "/app": "Painel",
  "/app/agenda-dia": "Agenda do Dia",
  "/app/agendar": "Agendar Consulta",
  "/app/pacientes": "Pacientes",
  "/app/profissionais": "Profissionais",
  "/app/agendas": "Agendas dos Profissionais",
  "/app/configuracoes": "Unidades & Especialidades",
  "/app/configuracoes/sistema": "Configurações",
};

function AppLayout() {
  const { user, loading } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;

  const title = titles[path] ?? Object.entries(titles).find(([k]) => path.startsWith(k))?.[1] ?? "SpokenMed";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-[11px] text-muted-foreground">SpokenMed · Secretaria de Saúde</span>
            </div>
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
