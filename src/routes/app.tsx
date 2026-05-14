import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
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
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/85 px-3 backdrop-blur sm:px-4"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)", height: "calc(3.5rem + env(safe-area-inset-top, 0px))" }}
          >
            <SidebarTrigger className="shrink-0" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{title}</span>
              <span className="truncate text-[11px] text-muted-foreground">SpokenMED · Secretaria de Saúde</span>
            </div>
          </header>
          <main
            className="min-w-0 flex-1 p-4 pb-24 sm:p-5 md:p-6 md:pb-6"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
          >
            <Outlet />
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
