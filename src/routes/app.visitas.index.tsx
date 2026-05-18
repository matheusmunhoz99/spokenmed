import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MapPin } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/app/visitas/")({ component: VisitasPage });

function VisitasPage() {
  const { user, isAcs } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["visitas", user?.id, isAcs],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("visitas_domiciliares")
        .select("id, data_visita, turno, desfecho, motivos, latitude, longitude, pacientes(nome, cpf), created_at")
        .order("data_visita", { ascending: false })
        .limit(200);
      if (isAcs) q = q.eq("acs_user_id", user!.id);
      return (await q).data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visitas Domiciliares</h1>
          <p className="text-sm text-muted-foreground">Ficha de Visita Domiciliar · e-SUS CDS</p>
        </div>
        <Link to="/app/visitas/nova"><Button><Plus className="mr-1 h-4 w-4" /> Nova visita</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Minhas visitas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <LoadingState /> : !data || data.length === 0 ? (
            <EmptyState title="Nenhuma visita registrada" description="Clique em Nova visita para começar." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Desfecho</TableHead>
                  <TableHead>GPS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="tabular-nums">{format(new Date(v.data_visita), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="capitalize">{v.turno}</TableCell>
                    <TableCell className="font-medium">{v.pacientes?.nome ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{v.desfecho}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      <a className="inline-flex items-center gap-1 underline" target="_blank" rel="noreferrer"
                         href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`}>
                        <MapPin className="h-3 w-3" /> mapa
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
