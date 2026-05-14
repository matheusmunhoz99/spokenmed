import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, Shield, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/app/sessoes")({ component: SessoesPage });

function parseUA(ua?: string | null) {
  if (!ua) return "Dispositivo desconhecido";
  if (/iPhone|iPad/i.test(ua)) return "iOS · Safari";
  if (/Android/i.test(ua)) return "Android";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  return ua.slice(0, 60);
}

function SessoesPage() {
  const { user, signOut } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    enabled: !!user,
    queryKey: ["my-sessions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, acao, ip, user_agent, created_at")
        .eq("user_id", user!.id)
        .eq("tabela", "auth")
        .in("acao", ["LOGIN", "LOGOUT"])
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const handleSignOutAll = async () => {
    try {
      await supabase.auth.signOut({ scope: "global" } as any);
      toast.success("Você foi desconectado de todas as sessões.");
      await signOut();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao encerrar sessões");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Segurança da conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sessão atual de <span className="font-medium text-foreground">{user?.email}</span>. Sessão expira após 30 minutos sem atividade.
          </p>
          <Button variant="destructive" onClick={handleSignOutAll}>
            <LogOut className="mr-2 h-4 w-4" /> Encerrar todas as sessões
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividade recente de login</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : (data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
          ) : (
            <ul className="divide-y">
              {data!.map((log: any) => (
                <li key={log.id} className="flex items-start gap-3 py-3">
                  <div className="mt-0.5 rounded-full bg-muted p-2"><Smartphone className="h-4 w-4 text-muted-foreground" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={log.acao === "LOGIN" ? "default" : "secondary"}>{log.acao}</Badge>
                      <span className="text-sm font-medium">{parseUA(log.user_agent)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "dd 'de' MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      {log.ip ? ` · IP ${log.ip}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => refetch()}>Atualizar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
