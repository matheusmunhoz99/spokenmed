import { createFileRoute, Outlet, Navigate, useRouterState, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { ShortcutsProvider, useShortcutsHelp } from "@/hooks/use-shortcuts";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Keyboard, Loader2 } from "lucide-react";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    // Server/client-side gate: ensure session is hydrated before children load.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

const titles: Record<string, string> = {
  "/app": "Painel",
  "/app/agenda-dia": "Agenda do Dia",
  "/app/agendar": "Agendar Consulta",
  "/app/pacientes": "Pacientes",
  "/app/profissionais": "Profissionais",
  "/app/agendas": "Agendas dos Profissionais",
  "/app/configuracoes/sistema": "Configurações",
  "/app/configuracoes/cotas": "Cotas de agendamento",
  "/app/cadastros": "Cadastros & Configurações",
  "/app/assinaturas": "Assinatura Digital de PDF",
  "/app/configuracoes": "Unidades & Especialidades",
  "/app/auditoria": "Central de Auditoria",
  "/app/relatorios": "Relatórios & Dashboards",
  "/app/exportar-esus": "Exportar para e-SUS PEC",
  "/app/sessoes": "Segurança & Sessões",
};

function AppLayout() {
  const { user, loading } = useAuth();
  useIdleLogout();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const isEmbed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;

  if (isEmbed) {
    return (
      <ShortcutsProvider>
        <main className="min-h-screen w-full bg-background p-4">
          <Outlet />
        </main>
      </ShortcutsProvider>
    );
  }

  const title = titles[path] ?? Object.entries(titles).sort((a, b) => b[0].length - a[0].length).find(([k]) => path.startsWith(k))?.[1] ?? "SpokenMed";


  return (
    <SidebarProvider>
      <ShortcutsProvider>
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
              <div className="ml-auto flex items-center">
                <HelpButton />
              </div>
            </header>
            <main
              className="min-w-0 flex-1 p-4 pb-24 sm:p-5 md:p-6 md:pb-6"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
            >
              <PageTransition>
                <Outlet />
              </PageTransition>
            </main>
          </div>
          <MobileBottomNav />
          <ShortcutsHelp />
        </div>
      </ShortcutsProvider>
    </SidebarProvider>
  );
}

function HelpButton() {
  const { setHelpOpen } = useShortcutsHelp();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="hidden h-9 w-9 sm:inline-flex"
      aria-label="Atalhos de teclado"
      onClick={() => setHelpOpen(true)}
    >
      <Keyboard className="h-4 w-4" />
    </Button>
  );
}
