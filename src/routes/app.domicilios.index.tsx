import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Users as UsersIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/app/domicilios/")({ component: DomiciliosPage });

function DomiciliosPage() {
  const { user, isAcs } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["domicilios", user?.id, isAcs],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("domicilios")
        .select("id, logradouro, numero, bairro, num_moradores, microarea, latitude, longitude, created_at, familias(id)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (isAcs) q = q.eq("acs_user_id", user!.id);
      return (await q).data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cadastro Domiciliar</h1>
          <p className="text-sm text-muted-foreground">Ficha de Cadastro Domiciliar e Territorial · e-SUS CDS</p>
        </div>
        <Link to="/app/domicilios/novo"><Button><Plus className="mr-1 h-4 w-4" /> Novo domicílio</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Domicílios cadastrados</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <LoadingState /> : !data || data.length === 0 ? (
            <EmptyState title="Nenhum domicílio cadastrado" description="Clique em Novo domicílio para iniciar." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Bairro</TableHead>
                  <TableHead>Microárea</TableHead>
                  <TableHead>Moradores</TableHead>
                  <TableHead>Famílias</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{[d.logradouro, d.numero].filter(Boolean).join(", ")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.bairro ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{d.microarea ?? "—"}</Badge></TableCell>
                    <TableCell className="tabular-nums">{d.num_moradores ?? 0}</TableCell>
                    <TableCell className="tabular-nums">
                      <span className="inline-flex items-center gap-1"><UsersIcon className="h-3 w-3" />{d.familias?.length ?? 0}</span>
                    </TableCell>
                    <TableCell><Link to="/app/domicilios/$id" params={{ id: d.id }}><Button size="sm" variant="outline">Abrir</Button></Link></TableCell>
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
