import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SemAcesso({ titulo = "Acesso restrito" }: { titulo?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card p-10 text-center">
      <ShieldAlert className="h-10 w-10 text-muted-foreground" />
      <div className="text-lg font-semibold">{titulo}</div>
      <p className="max-w-md text-sm text-muted-foreground">
        Você não tem permissão para acessar este módulo. Peça a um administrador para liberar o acesso em
        Configurações → Usuários.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/app">Voltar ao início</Link>
      </Button>
    </div>
  );
}
