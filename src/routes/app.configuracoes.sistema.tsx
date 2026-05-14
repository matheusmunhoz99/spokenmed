import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/configuracoes/sistema")({ component: ConfigSistema });

function ConfigSistema() {
  const { profile, user, isAdmin } = useAuth();
  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Sua conta</CardTitle>
          <CardDescription>Informações do usuário logado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Nome" value={profile?.nome ?? "—"} />
          <Row label="E-mail" value={user?.email ?? "—"} />
          <Row label="Cargo" value={profile?.cargo ?? "—"} />
          <Row label="Perfil" value={isAdmin ? <Badge className="bg-primary/15 text-primary border-0">Administrador</Badge> : <Badge variant="secondary">Recepcionista</Badge>} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sobre o SpokenMed</CardTitle>
          <CardDescription>Sistema de agendamento médico para a Secretaria Municipal de Saúde.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Versão 1.0 · Uso institucional</p>
          <p>Para criar novos usuários do sistema, peça que eles se cadastrem na tela de login. Novos cadastros entram como <strong>Recepcionista</strong> automaticamente.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
