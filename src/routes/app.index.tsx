import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Stethoscope, CalendarCheck, AlertCircle, ArrowRight, Building2, CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { format } from "date-fns";
import { formatTime } from "@/lib/format";

export const Route = createFileRoute("/app/")({ component: Dashboard });

function Dashboard() {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: kpis } = useQuery({
    queryKey: ["dashboard-kpis", today],
    queryFn: async () => {
      const [pac, prof, hoje, livres, faltas] = await Promise.all([
        supabase.from("pacientes").select("*", { count: "exact", head: true }),
        supabase.from("profissionais").select("*", { count: "exact", head: true }).eq("ativo", true),
        supabase.from("agendamentos").select("*", { count: "exact", head: true }).eq("data", today).neq("status", "cancelado"),
        supabase.from("slots").select("*", { count: "exact", head: true }).eq("status", "livre").gte("data", today),
        supabase.from("agendamentos").select("*", { count: "exact", head: true }).eq("status", "faltou").gte("data", format(new Date(Date.now() - 7*86400000), "yyyy-MM-dd")),
      ]);
      return {
        pacientes: pac.count ?? 0,
        profissionais: prof.count ?? 0,
        hoje: hoje.count ?? 0,
        livres: livres.count ?? 0,
        faltas7d: faltas.count ?? 0,
      };
    },
  });

  const { data: proximos } = useQuery({
    queryKey: ["dashboard-proximos", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, data, hora_inicio, status, pacientes(nome), profissionais(nome)")
        .eq("data", today)
        .neq("status", "cancelado")
        .order("hora_inicio", { ascending: true })
        .limit(8);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPI icon={CalendarCheck} label="Agendamentos hoje" value={kpis?.hoje ?? "—"} tone="primary" />
        <KPI icon={Users} label="Pacientes cadastrados" value={kpis?.pacientes ?? "—"} />
        <KPI icon={Stethoscope} label="Profissionais ativos" value={kpis?.profissionais ?? "—"} />
        <KPI icon={AlertCircle} label="Faltas (7 dias)" value={kpis?.faltas7d ?? "—"} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Próximos atendimentos de hoje</CardTitle>
              <CardDescription>{proximos?.length ?? 0} agendamentos previstos</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/agenda-dia">Ver agenda completa <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!proximos || proximos.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nenhum agendamento para hoje" description="Quando houver consultas marcadas, elas aparecerão aqui." compact />
            ) : (
              <ul className="divide-y">
                {proximos.map((a: any) => (
                  <li key={a.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-4">
                      <div className="w-14 text-sm font-mono text-foreground">{formatTime(a.hora_inicio)}</div>
                      <div>
                        <div className="text-sm font-medium">{a.pacientes?.nome}</div>
                        <div className="text-xs text-muted-foreground">{a.profissionais?.nome}</div>
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vagas disponíveis</CardTitle>
            <CardDescription>Slots livres a partir de hoje</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-4xl font-semibold">{kpis?.livres ?? "—"}</div>
            <Button asChild className="w-full"><Link to="/app/agendar">Agendar consulta</Link></Button>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button asChild variant="outline" size="sm"><Link to="/app/pacientes"><Users className="mr-1 h-4 w-4"/>Pacientes</Link></Button>
              <Button asChild variant="outline" size="sm"><Link to="/app/agendas"><Building2 className="mr-1 h-4 w-4"/>Agendas</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone?: "primary" | "warning" }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-3xl font-semibold">{value}</div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${
          tone === "warning" ? "bg-warning/15 text-warning" :
          tone === "primary" ? "bg-primary/15 text-primary" :
          "bg-muted text-muted-foreground"
        }`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    agendado: { label: "Agendado", cls: "bg-secondary text-secondary-foreground" },
    confirmado: { label: "Confirmado", cls: "bg-primary/15 text-primary" },
    chegou: { label: "Chegou", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
    em_triagem: { label: "Em triagem", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
    triado: { label: "Pronto p/ consulta", cls: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/40" },
    atendido: { label: "Atendido", cls: "bg-success/15 text-success" },
    faltou: { label: "Faltou", cls: "bg-warning/20 text-warning-foreground" },
    cancelado: { label: "Cancelado", cls: "bg-destructive/15 text-destructive" },
  };
  const m = map[status] ?? map.agendado;
  return <Badge className={`${m.cls} border-0 font-medium`} variant="secondary">{m.label}</Badge>;
}
