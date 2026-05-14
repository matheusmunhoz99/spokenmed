import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, UserCheck, AlertTriangle, Loader2, Download, Trash2, Megaphone } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { StatusBadge } from "./app.index";
import { formatTime } from "@/lib/format";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { useAuth } from "@/hooks/use-auth";
import { gerarPdfAgenda } from "@/lib/pdf-agenda";
import { ChamarDialog } from "@/components/chamar-dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { SemAcesso } from "@/components/sem-acesso";
function AgendaDiaGuard() {
  const { can } = useAuth();
  if (!can("agenda_dia")) return <SemAcesso />;
  return <AgendaDiaPage />;
}
export const Route = createFileRoute("/app/agenda-dia")({
  component: AgendaDiaGuard,
});
const _UnusedAgendaDiaRoute = ({
  component: AgendaDiaPage,
  validateSearch: (s: Record<string, unknown>) => ({ data: (s.data as string) ?? "" }),
});

function AgendaDiaPage() {
  const search = Route.useSearch();
  const qc = useQueryClient();
  const { profile, user, isAdmin } = useAuth();
  const [data, setData] = useState(search.data || format(new Date(), "yyyy-MM-dd"));
  const [unidadeId, setUnidadeId] = useState<string>("all");
  const [profId, setProfId] = useState<string>("all");
  const [chamar, setChamar] = useState<any>(null);
  const [excluir, setExcluir] = useState<any>(null);

  const { data: unidades } = useAllowedUnidades();
  const allowedIds = useMemo(() => (unidades ?? []).map((u: any) => u.id), [unidades]);

  const { data: profs } = useQuery({
    queryKey: ["profs-day", unidadeId, allowedIds.join(",")],
    enabled: !!unidades,
    queryFn: async () => {
      // RLS já restringe profissionais. Se filtrarmos por unidade, juntamos via profissional_unidades.
      if (unidadeId !== "all") {
        const { data } = await supabase
          .from("profissional_unidades")
          .select("profissional_id, profissionais(id, nome, ativo)")
          .eq("unidade_id", unidadeId);
        return (data ?? [])
          .map((r: any) => r.profissionais)
          .filter((p: any) => p && p.ativo)
          .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
      }
      const { data } = await supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome");
      return data ?? [];
    },
  });

  const { data: ags, isLoading } = useQuery({
    queryKey: ["agenda-dia", data, profId, unidadeId, allowedIds.join(",")],
    enabled: !!unidades,
    queryFn: async () => {
      let q = supabase.from("agendamentos")
        .select("id, hora_inicio, status, motivo, paciente_id, slot_id, unidade_id, pacientes(nome, cpf, telefone), profissionais(nome, especialidades(nome)), unidades(nome)")
        .eq("data", data).order("hora_inicio");
      if (profId !== "all") q = q.eq("profissional_id", profId);
      if (unidadeId !== "all") q = q.eq("unidade_id", unidadeId);
      else if (allowedIds.length > 0) q = q.in("unidade_id", allowedIds);
      return (await q).data ?? [];
    },
  });

  const updateStatus = async (a: any, status: "agendado"|"confirmado"|"atendido"|"faltou"|"cancelado") => {
    const { error } = await supabase.from("agendamentos").update({ status }).eq("id", a.id);
    if (error) return toast.error(error.message);
    if (status === "cancelado") {
      await supabase.from("slots").update({ status: "livre" }).eq("id", a.slot_id);
    }
    toast.success("Status atualizado");
    qc.invalidateQueries({ queryKey: ["agenda-dia"] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Data</div>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Unidade</div>
            <Select value={unidadeId} onValueChange={(v) => { setUnidadeId(v); setProfId("all"); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {unidades?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Profissional</div>
            <Select value={profId} onValueChange={setProfId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profs?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="self-end">
            <Button
              variant="outline"
              className="w-full"
              disabled={!ags || ags.length === 0}
              onClick={() => {
                if (!ags || ags.length === 0) return;
                const unidadeNome = unidadeId === "all"
                  ? "Todas as unidades"
                  : (unidades?.find((u: any) => u.id === unidadeId)?.nome ?? "Unidade");
                gerarPdfAgenda({
                  data,
                  unidadeNome,
                  agendamentos: ags as any,
                  usuarioNome: profile?.nome || user?.email || "Usuário",
                });
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Exportar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base sm:text-lg">{ags?.length ?? 0} consultas em {new Date(data + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando...</div>
          ) : ags?.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">Sem agendamentos para o filtro selecionado.</div>
          ) : (
            <ul className="divide-y">
              {ags?.map((a: any) => (
                <li key={a.id} className="flex flex-col gap-3 py-3 md:flex-row md:flex-wrap md:items-center md:gap-4">
                  <div className="flex items-start gap-3 md:contents">
                    <div className="w-14 shrink-0 rounded-md bg-muted px-2 py-1 text-center font-mono text-sm md:w-16 md:bg-transparent md:px-0 md:py-0 md:text-left">{formatTime(a.hora_inicio)}</div>
                    <div className="min-w-0 flex-1 md:min-w-[200px]">
                      <div className="truncate text-sm font-medium">{a.pacientes?.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.profissionais?.nome}{a.profissionais?.especialidades?.nome ? ` · ${a.profissionais.especialidades.nome}` : ""}
                        {a.unidades?.nome && <> · <span className="text-primary/80">{a.unidades.nome}</span></>}
                      </div>
                      {a.motivo && <div className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">"{a.motivo}"</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:contents">
                    <StatusBadge status={a.status} />
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Confirmar" onClick={() => updateStatus(a, "confirmado")}><CheckCircle2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Atendido" onClick={() => updateStatus(a, "atendido")}><UserCheck className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Faltou" onClick={() => updateStatus(a, "faltou")}><AlertTriangle className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Cancelar" onClick={() => updateStatus(a, "cancelado")}><XCircle className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
