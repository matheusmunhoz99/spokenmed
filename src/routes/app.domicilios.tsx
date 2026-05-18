import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";

function Guard() {
  const { can } = useAuth();
  if (!can("domicilios")) return <SemAcesso />;
  return <Outlet />;
}

export const Route = createFileRoute("/app/domicilios")({ component: Guard });
