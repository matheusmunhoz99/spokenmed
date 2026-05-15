import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, UserCheck, AlertTriangle, Loader2, Download, Trash2, Megaphone, CalendarClock, History, Zap, Plus, Paperclip, ListOrdered } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { format } from "date-fns";
import { toast } from "sonner";
import { StatusBadge } from "./app.index";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatTime } from "@/lib/format";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { useAuth } from "@/hooks/use-auth";
import { gerarPdfAgenda } from "@/lib/pdf-agenda";
import { ChamarDialog } from "@/components/chamar-dialog";
import { ReagendarDialog } from "@/components/reagendar-dialog";
import { HistoricoDialog } from "@/components/historico-dialog";
import { EncaixeDialog } from "@/components/encaixe-dialog";
import { AnexosDialog } from "@/components/anexos-dialog";
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
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [reagendar, setReagendar] = useState<any>(null);
  const [historico, setHistorico] = useState<any>(null);
  const [encaixeOpen, setEncaixeOpen] = useState(false);
  const [anexos, setAnexos] = useState<any>(null);

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
        .select("id, hora_inicio, status, motivo, paciente_id, slot_id, profissional_id, unidade_id, is_encaixe, encaixe_prioridade, encaixe_justificativa, reagendado_em, pacientes(nome, cpf, telefone), profissionais(id, nome, sala, especialidades(nome)), unidades(nome)")
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

  // Pré-checa se o agendamento a excluir veio da fila
  const { data: filaLink, isFetching: filaChecking } = useQuery({
    queryKey: ["agenda-dia-fila-link", excluir?.id],
    enabled: !!excluir?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("fila_espera" as any) as any)
        .select("id, especialidades(nome)").eq("agendamento_id", excluir.id).maybeSingle();
      return data ?? null;
    },
  });

  const handleDelete = async (a: any) => {
    setExcluindo(true);
    try {
      // 1) Snapshot + histórico (preserva motivo após o DELETE; tabela não tem FK em cascata)
      const snapshot = {
        id: a.id,
        data,
        hora_inicio: a.hora_inicio,
        paciente: a.pacientes?.nome,
        paciente_id: a.paciente_id,
        profissional: a.profissionais?.nome,
        profissional_id: a.profissional_id,
        unidade: a.unidades?.nome,
        unidade_id: a.unidade_id,
        status: a.status,
        slot_id: a.slot_id,
        is_encaixe: a.is_encaixe,
        veio_da_fila: !!filaLink?.id,
      };
      await (supabase.from("agendamento_historico" as any) as any).insert({
        agendamento_id: a.id,
        evento: "excluido",
        motivo: motivoExclusao.trim() || null,
        de: snapshot,
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
      });
      // 2) Liberar a fila ANTES do delete (FK ON DELETE SET NULL dispara fn_fila_check_link)
      if (filaLink?.id) {
        const { error: filaErr } = await (supabase.from("fila_espera" as any) as any)
          .update({ status: "aguardando", agendamento_id: null }).eq("id", filaLink.id);
        if (filaErr) { toast.error(filaErr.message); return; }
      }
      // 3) Deletar o agendamento
      const { error } = await supabase.from("agendamentos").delete().eq("id", a.id);
      if (error) { toast.error(error.message); return; }
      // 4) Liberar slot (idempotente)
      if (a.slot_id) {
        await supabase.from("slots").update({ status: "livre" }).eq("id", a.slot_id);
      }
      toast.success(filaLink?.id ? "Agendamento excluído. Paciente devolvido à fila." : "Agendamento excluído");
      setExcluir(null);
      setMotivoExclusao("");
      qc.invalidateQueries({ queryKey: ["agenda-dia"] });
    } finally {
      setExcluindo(false);
    }
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
          <div className="self-end flex gap-2">
            <Button variant="default" className="flex-1" onClick={() => setEncaixeOpen(true)}>
              <Zap className="mr-2 h-4 w-4" /> Encaixe
            </Button>
            <Button
              variant="outline"
              className="flex-1"
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
              <Download className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base sm:text-lg">{ags?.length ?? 0} consultas em {new Date(data + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState variant="list" rows={6} />
          ) : ags?.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Sem agendamentos" description="Não há consultas para o filtro selecionado." />
          ) : (
            <ul className="divide-y">
              {ags?.map((a: any) => (
                <li key={a.id} className={`flex flex-col gap-3 py-3 md:flex-row md:flex-wrap md:items-center md:gap-4 ${a.is_encaixe ? "bg-amber-50/40 dark:bg-amber-950/10 border-l-4 border-amber-400 pl-2" : ""}`}>
                  <div className="flex items-start gap-3 md:contents">
                    <div className="w-14 shrink-0 rounded-md bg-muted px-2 py-1 text-center font-mono text-sm md:w-16 md:bg-transparent md:px-0 md:py-0 md:text-left">{formatTime(a.hora_inicio)}</div>
                    <div className="min-w-0 flex-1 md:min-w-[200px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{a.pacientes?.nome}</span>
                        {a.is_encaixe && (
                          <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 text-[10px]">
                            <Zap className="mr-0.5 h-3 w-3" /> Encaixe{a.encaixe_prioridade ? ` · ${a.encaixe_prioridade}` : ""}
                          </Badge>
                        )}
                        {a.reagendado_em && (
                          <Badge variant="outline" className="border-violet-300 bg-violet-100 text-violet-800 text-[10px]">
                            Reagendado
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.profissionais?.nome}{a.profissionais?.especialidades?.nome ? ` · ${a.profissionais.especialidades.nome}` : ""}
                        {a.unidades?.nome && <> · <span className="text-primary/80">{a.unidades.nome}</span></>}
                      </div>
                      {a.motivo && <div className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">"{a.motivo}"</div>}
                      {a.is_encaixe && a.encaixe_justificativa && (
                        <div className="mt-1 line-clamp-2 text-xs text-amber-800/80">Justificativa: {a.encaixe_justificativa}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:contents">
                    <StatusBadge status={a.status} />
                    <div className="flex flex-wrap gap-1">
                      {a.unidade_id && (
                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-primary" title="Chamar paciente" onClick={() => setChamar(a)}><Megaphone className="h-4 w-4" /></Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Confirmar" onClick={() => updateStatus(a, "confirmado")}><CheckCircle2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Atendido" onClick={() => updateStatus(a, "atendido")}><UserCheck className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Faltou" onClick={() => updateStatus(a, "faltou")}><AlertTriangle className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Cancelar" onClick={() => updateStatus(a, "cancelado")}><XCircle className="h-4 w-4" /></Button>
                      {!a.is_encaixe && a.slot_id && (
                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Reagendar" onClick={() => setReagendar(a)}><CalendarClock className="h-4 w-4" /></Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Anexos" onClick={() => setAnexos(a)}><Paperclip className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Histórico" onClick={() => setHistorico(a)}><History className="h-4 w-4" /></Button>
                      {isAdmin && (
                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-destructive hover:text-destructive" title="Excluir" onClick={() => setExcluir(a)}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ChamarDialog
        open={!!chamar}
        onOpenChange={(v) => !v && setChamar(null)}
        agendamento={chamar}
        userId={user?.id}
      />

      <AlertDialog open={!!excluir} onOpenChange={(v) => { if (!v) { setExcluir(null); setMotivoExclusao(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" /> Excluir agendamento?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. Verifique os dados antes de confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {excluir && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-xs">
                <div><span className="text-muted-foreground">Paciente:</span><br /><strong className="text-sm">{excluir.pacientes?.nome}</strong></div>
                <div><span className="text-muted-foreground">Horário:</span><br /><strong className="text-sm">{formatTime(excluir.hora_inicio)}</strong></div>
                <div className="col-span-2"><span className="text-muted-foreground">Profissional:</span> {excluir.profissionais?.nome}{excluir.profissionais?.especialidades?.nome ? ` · ${excluir.profissionais.especialidades.nome}` : ""}</div>
                {excluir.unidades?.nome && (
                  <div className="col-span-2"><span className="text-muted-foreground">Unidade:</span> {excluir.unidades.nome}</div>
                )}
              </div>

              {filaChecking ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando vínculo com a fila…
                </div>
              ) : filaLink?.id ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  <ListOrdered className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>Paciente veio da fila de espera{(filaLink as any)?.especialidades?.nome ? ` (${(filaLink as any).especialidades.nome})` : ""}.</strong>
                    <div>Ao excluir, ele será devolvido à fila com status <em>aguardando</em>.</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                  Este agendamento não está vinculado à fila de espera. O horário voltará a ficar livre.
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="motivo-exclusao" className="text-xs">Motivo da exclusão (opcional)</Label>
                <Textarea
                  id="motivo-exclusao"
                  placeholder="Ex.: paciente desistiu, agendamento duplicado, erro de cadastro…"
                  value={motivoExclusao}
                  onChange={(e) => setMotivoExclusao(e.target.value.slice(0, 500))}
                  rows={2}
                />
                <div className="text-[10px] text-muted-foreground">
                  Será registrado no histórico do paciente e na auditoria.
                </div>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={excluindo || filaChecking}
              onClick={(e) => { e.preventDefault(); excluir && handleDelete(excluir); }}
            >
              {excluindo ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Excluindo…</> : "Confirmar exclusão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReagendarDialog
        open={!!reagendar}
        onOpenChange={(v) => !v && setReagendar(null)}
        agendamento={reagendar}
      />

      <HistoricoDialog
        open={!!historico}
        onOpenChange={(v) => !v && setHistorico(null)}
        agendamentoId={historico?.id ?? null}
        pacienteNome={historico?.pacientes?.nome}
      />

      <EncaixeDialog open={encaixeOpen} onOpenChange={setEncaixeOpen} />

      <AnexosDialog
        open={!!anexos}
        onOpenChange={(v) => !v && setAnexos(null)}
        agendamento={anexos}
      />
    </div>
  );
}
