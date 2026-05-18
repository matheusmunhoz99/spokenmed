import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ListOrdered, Plus, Search, CalendarPlus, Trash2, Loader2, Check, FileText, Clock,
  AlertTriangle, MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { SemAcesso } from "@/components/sem-acesso";
import { formatCPF, formatDate, formatTime, onlyDigits } from "@/lib/format";

function calcIdade(dn?: string | null) {
  if (!dn) return null;
  const d = new Date(dn);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) idade--;
  return idade;
}
import { gerarComprovante } from "@/lib/pdf-comprovante";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

function FilaGuard() {
  const { can } = useAuth();
  if (!can("fila")) return <SemAcesso />;
  return <FilaPage />;
}
export const Route = createFileRoute("/app/fila")({ component: FilaGuard });

const FILA_TABLE = "fila_espera" as const;

type Urgencia = "normal" | "prioritaria" | "urgente";
type StatusFila = "aguardando" | "agendado" | "cancelado";
type ClassRisco = "vermelho" | "laranja" | "amarelo" | "verde" | "azul";

const URGENCIA_LABEL: Record<Urgencia, string> = {
  normal: "Normal",
  prioritaria: "Prioritária",
  urgente: "Urgente",
};
const URGENCIA_RANK: Record<Urgencia, number> = { urgente: 0, prioritaria: 1, normal: 2 };

const RISCO_LABEL: Record<ClassRisco, string> = {
  vermelho: "Vermelho · Emergência",
  laranja: "Laranja · Muito urgente",
  amarelo: "Amarelo · Urgente",
  verde: "Verde · Pouco urgente",
  azul: "Azul · Não urgente",
};
const RISCO_RANK: Record<ClassRisco, number> = { vermelho: 0, laranja: 1, amarelo: 2, verde: 3, azul: 4 };
const RISCO_TME_DEFAULT: Record<ClassRisco, number> = { vermelho: 1, laranja: 7, amarelo: 30, verde: 90, azul: 180 };

function riscoBadgeClass(r: ClassRisco) {
  if (r === "vermelho") return "bg-red-600 text-white hover:bg-red-600";
  if (r === "laranja") return "bg-orange-500 text-white hover:bg-orange-500";
  if (r === "amarelo") return "bg-yellow-400 text-black hover:bg-yellow-400";
  if (r === "verde") return "bg-emerald-500 text-white hover:bg-emerald-500";
  return "bg-sky-500 text-white hover:bg-sky-500";
}

function urgenciaBadgeClass(u: Urgencia) {
  if (u === "urgente") return "bg-destructive text-destructive-foreground hover:bg-destructive";
  if (u === "prioritaria") return "bg-amber-500 text-white hover:bg-amber-500 dark:bg-amber-600";
  return "bg-muted text-muted-foreground hover:bg-muted";
}

function FilaPage() {
  const { user, profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: unidadesAllowed } = useAllowedUnidades();
  const [unidadeId, setUnidadeId] = useState("");
  const [especialidadeId, setEspecialidadeId] = useState("all");
  const [statusFiltro, setStatusFiltro] = useState<"aguardando" | "agendado" | "todos">("aguardando");
  const [busca, setBusca] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [agendarItem, setAgendarItem] = useState<any>(null);
  const [removerItem, setRemoverItem] = useState<any>(null);
  const [motivoRemover, setMotivoRemover] = useState("");
  const [removendo, setRemovendo] = useState(false);

  useEffect(() => {
    if (!unidadeId && unidadesAllowed?.length) setUnidadeId(unidadesAllowed[0].id);
  }, [unidadesAllowed, unidadeId]);

  const { data: especs } = useQuery({
    queryKey: ["fila-especs", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profissional_unidades")
        .select("profissionais(especialidade_id, especialidades(id, nome))")
        .eq("unidade_id", unidadeId);
      const map = new Map<string, { id: string; nome: string }>();
      (data ?? []).forEach((r: any) => {
        const e = r.profissionais?.especialidades;
        if (e?.id) map.set(e.id, { id: e.id, nome: e.nome });
      });
      return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });

  const queryKey = ["fila", unidadeId, especialidadeId, statusFiltro];
  const { data: fila, isLoading } = useQuery({
    queryKey,
    enabled: !!unidadeId,
    queryFn: async () => {
      let q = (supabase.from(FILA_TABLE as any) as any)
        .select("id, created_at, observacoes, paciente_id, especialidade_id, unidade_id, status, urgencia, agendamento_id, classificacao_risco, cid10, solicitante_nome, solicitante_cns, solicitante_cbo, solicitante_cnes, procedimento_id, pacientes(id, nome, cpf, cns, telefone, data_nascimento), especialidades(id, nome), unidades(id, nome), procedimentos(id, codigo_sigtap, nome)")
        .eq("unidade_id", unidadeId)
        .in("status", statusFiltro === "todos" ? ["aguardando", "agendado"] : [statusFiltro])
        .order("created_at", { ascending: true });
      if (especialidadeId !== "all") q = q.eq("especialidade_id", especialidadeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // TME: regras vigentes (default + customizadas) — usadas para classificar prazo
  const { data: tmeRows } = useQuery({
    queryKey: ["tme-config"],
    queryFn: async () => (await (supabase.from("tme_config" as any) as any).select("especialidade_id, unidade_id, classificacao_risco, tme_dias")).data ?? [],
  });

  function tmeFor(especId: string | null, classif: ClassRisco | null, unId: string | null): number {
    if (!classif) return Infinity;
    const rows = (tmeRows ?? []) as any[];
    const matches = rows.filter((r) => r.classificacao_risco === classif
      && (r.especialidade_id === especId || r.especialidade_id === null)
      && (r.unidade_id === unId || r.unidade_id === null));
    if (matches.length === 0) return RISCO_TME_DEFAULT[classif];
    matches.sort((a, b) => (Number(b.especialidade_id !== null) - Number(a.especialidade_id !== null))
      || (Number(b.unidade_id !== null) - Number(a.unidade_id !== null)));
    return matches[0].tme_dias;
  }

  // Realtime → invalida toda vez que a tabela muda nessa unidade
  useEffect(() => {
    if (!unidadeId) return;
    const ch = supabase
      .channel(`fila-${unidadeId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: FILA_TABLE, filter: `unidade_id=eq.${unidadeId}` },
        () => qc.invalidateQueries({ queryKey: ["fila", unidadeId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [unidadeId, qc]);

  // Ordena por (aguardando primeiro, classificação de risco SUS, urgência legacy, created_at)
  const filaOrdenada = useMemo(() => {
    if (!fila) return [];
    const arr = [...fila].sort((a, b) => {
      const sa = a.status === "aguardando" ? 0 : 1;
      const sb = b.status === "aguardando" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const ra = RISCO_RANK[a.classificacao_risco as ClassRisco] ?? 99;
      const rb = RISCO_RANK[b.classificacao_risco as ClassRisco] ?? 99;
      if (ra !== rb) return ra - rb;
      const ua = URGENCIA_RANK[a.urgencia as Urgencia] ?? 2;
      const ub = URGENCIA_RANK[b.urgencia as Urgencia] ?? 2;
      if (ua !== ub) return ua - ub;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const counters: Record<string, number> = {};
    return arr.map((f) => {
      let posicao: number | null = null;
      if (f.status === "aguardando") {
        counters[f.especialidade_id] = (counters[f.especialidade_id] ?? 0) + 1;
        posicao = counters[f.especialidade_id];
      }
      return { ...f, posicao };
    });
  }, [fila]);

  const filaFiltrada = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return filaOrdenada;
    const digits = onlyDigits(term);
    return filaOrdenada.filter((f: any) =>
      f.pacientes?.nome?.toLowerCase().includes(term) ||
      (digits.length >= 3 && f.pacientes?.cpf?.includes(digits))
    );
  }, [filaOrdenada, busca]);

  const handleRemover = async (item: any) => {
    setRemovendo(true);
    try {
      const stamp = format(new Date(), "dd/MM/yyyy HH:mm");
      const who = profile?.nome || user?.email || "—";
      const motivo = motivoRemover.trim();
      const tag = `[REMOVIDO em ${stamp} por ${who}${motivo ? `: ${motivo}` : ""}]`;
      const novasObs = item.observacoes ? `${item.observacoes}\n${tag}` : tag;
      const { error } = await (supabase.from(FILA_TABLE as any) as any)
        .update({ status: "cancelado", observacoes: novasObs }).eq("id", item.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Removido da fila");
      setRemoverItem(null);
      setMotivoRemover("");
      qc.invalidateQueries({ queryKey: ["fila", unidadeId] });
    } finally {
      setRemovendo(false);
    }
  };

  const handleAlterarUrgencia = async (item: any, urgencia: Urgencia) => {
    if (item.urgencia === urgencia) return;
    const { error } = await (supabase.from(FILA_TABLE as any) as any)
      .update({ urgencia }).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success(`Urgência atualizada para ${URGENCIA_LABEL[urgencia]}`);
    qc.invalidateQueries({ queryKey: ["fila", unidadeId] });
  };

  const unidadeNome = unidadesAllowed?.find((u: any) => u.id === unidadeId)?.nome ?? "";

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["fila", unidadeId] })}>
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ListOrdered className="h-5 w-5 text-primary" /> Fila de Espera
            </CardTitle>
            <CardDescription>Pacientes aguardando agendamento por especialidade · atualiza em tempo real.</CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} disabled={!unidadeId}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar à fila
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {(unidadesAllowed ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Especialidade</Label>
            <Select value={especialidadeId} onValueChange={setEspecialidadeId} disabled={!unidadeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(especs ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFiltro} onValueChange={(v: any) => setStatusFiltro(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aguardando">Aguardando</SelectItem>
                <SelectItem value="agendado">Agendados</SelectItem>
                <SelectItem value="todos">Todos (em aberto)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Buscar paciente</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CPF" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">
            {filaFiltrada.length} {filaFiltrada.length === 1 ? "paciente" : "pacientes"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState variant="list" rows={5} />
          ) : filaFiltrada.length === 0 ? (
            <EmptyState icon={ListOrdered} title="Nenhum paciente na fila" description="Adicione o primeiro paciente acima para iniciar a fila desta especialidade." />
          ) : (
            <ul className="divide-y">
              {filaFiltrada.map((f: any) => {
                const dias = differenceInDays(new Date(), new Date(f.created_at));
                const urg = (f.urgencia ?? "normal") as Urgencia;
                const classif = (f.classificacao_risco ?? null) as ClassRisco | null;
                const tmeDias = classif ? tmeFor(f.especialidade_id, classif, f.unidade_id) : null;
                const dentroTme = tmeDias === null || dias <= tmeDias;
                const isAgendado = f.status === "agendado";
                return (
                  <li key={f.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:gap-4">
                    <div className="flex shrink-0 items-center gap-3 md:contents">
                      {isAgendado ? (
                        <Badge variant="secondary" className="h-9 min-w-12 justify-center rounded-md px-2 text-xs font-semibold">
                          Agendado
                        </Badge>
                      ) : (
                        <Badge variant="default" className="h-9 min-w-12 justify-center rounded-md px-2 text-base font-bold tabular-nums">
                          #{f.posicao}
                        </Badge>
                      )}
                      <div className="min-w-0 flex-1 md:min-w-[220px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-medium">{f.pacientes?.nome}</div>
                          {classif && (
                            <Badge className={`text-[10px] uppercase ${riscoBadgeClass(classif)}`} title={RISCO_LABEL[classif]}>
                              {classif}
                            </Badge>
                          )}
                          <Badge className={`text-[10px] uppercase ${urgenciaBadgeClass(urg)}`}>
                            {urg === "urgente" && <AlertTriangle className="mr-1 h-3 w-3" />}
                            {URGENCIA_LABEL[urg]}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {f.especialidades?.nome && <span><span className="font-medium text-foreground/70">Especialidade:</span> {f.especialidades.nome}</span>}
                          {f.unidades?.nome && <span><span className="font-medium text-foreground/70">Unidade:</span> {f.unidades.nome}</span>}
                          {f.pacientes?.cpf && <span><span className="font-medium text-foreground/70">CPF:</span> {formatCPF(f.pacientes.cpf)}</span>}
                          {f.cid10 && <span><span className="font-medium text-foreground/70">CID-10:</span> {f.cid10}</span>}
                          {f.procedimentos?.codigo_sigtap && <span><span className="font-medium text-foreground/70">SIGTAP:</span> {f.procedimentos.codigo_sigtap}</span>}
                          {f.solicitante_nome && <span><span className="font-medium text-foreground/70">Solicitante:</span> {f.solicitante_nome}{f.solicitante_cns ? ` · CNS ${f.solicitante_cns}` : ""}</span>}
                          {f.pacientes?.data_nascimento && (
                            <span>
                              <span className="font-medium text-foreground/70">Nasc.:</span> {formatDate(f.pacientes.data_nascimento)}
                              {calcIdade(f.pacientes.data_nascimento) !== null && ` (${calcIdade(f.pacientes.data_nascimento)} anos)`}
                            </span>
                          )}
                        </div>
                        {f.observacoes && (
                          <div className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">"{f.observacoes}"</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 md:contents">
                      <div className={`flex items-center gap-1 text-xs ${dentroTme ? "text-muted-foreground" : "text-destructive font-medium"}`}>
                        <Clock className="h-3.5 w-3.5" />
                        {dias === 0 ? "hoje" : `${dias} dia${dias > 1 ? "s" : ""}`}
                        {tmeDias !== null && Number.isFinite(tmeDias) && (
                          <span className="ml-1 opacity-80">/ TME {tmeDias}d{!dentroTme ? " · ESTOURADO" : ""}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {!isAgendado && (
                          <Button size="sm" onClick={() => setAgendarItem(f)}>
                            <CalendarPlus className="mr-1 h-4 w-4" /> Agendar
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Mais ações">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-xs">Urgência</DropdownMenuLabel>
                            {(["normal", "prioritaria", "urgente"] as Urgencia[]).map((u) => (
                              <DropdownMenuItem key={u} onClick={() => handleAlterarUrgencia(f, u)}>
                                {urg === u && <Check className="mr-2 h-4 w-4" />}
                                <span className={urg === u ? "" : "ml-6"}>{URGENCIA_LABEL[u]}</span>
                              </DropdownMenuItem>
                            ))}
                            {isAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => setRemoverItem(f)}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Remover da fila
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddFilaDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        unidadeId={unidadeId}
        unidadeNome={unidadeNome}
        userId={user?.id}
        especialidades={especs ?? []}
        onCreated={() => qc.invalidateQueries({ queryKey: ["fila", unidadeId] })}
      />

      <AgendarFilaDialog
        item={agendarItem}
        onClose={() => setAgendarItem(null)}
        userId={user?.id}
        userNome={profile?.nome || user?.email || ""}
        onDone={() => qc.invalidateQueries({ queryKey: ["fila", unidadeId] })}
      />

      <AlertDialog open={!!removerItem} onOpenChange={(v) => { if (!v) { setRemoverItem(null); setMotivoRemover(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" /> Remover da fila?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação marca o item como cancelado e o tira da fila ativa.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {removerItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-xs">
                <div className="col-span-2"><span className="text-muted-foreground">Paciente:</span><br /><strong className="text-sm">{removerItem.pacientes?.nome}</strong></div>
                <div><span className="text-muted-foreground">Especialidade:</span><br />{removerItem.especialidades?.nome ?? "—"}</div>
                <div><span className="text-muted-foreground">Unidade:</span><br />{removerItem.unidades?.nome ?? "—"}</div>
                {removerItem.pacientes?.cpf && <div><span className="text-muted-foreground">CPF:</span><br />{formatCPF(removerItem.pacientes.cpf)}</div>}
                {removerItem.pacientes?.data_nascimento && <div><span className="text-muted-foreground">Nascimento:</span><br />{formatDate(removerItem.pacientes.data_nascimento)}</div>}
                <div><span className="text-muted-foreground">Urgência:</span><br /><Badge className={urgenciaBadgeClass(removerItem.urgencia)}>{URGENCIA_LABEL[removerItem.urgencia as Urgencia]}</Badge></div>
                <div className="col-span-2"><span className="text-muted-foreground">Na fila desde:</span> {removerItem.created_at ? format(new Date(removerItem.created_at), "dd/MM/yyyy HH:mm") : "—"}</div>
              </div>

              {removerItem.status === "agendado" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>Este item está vinculado a um agendamento ativo.</strong>
                    <div>Recomenda-se cancelar/excluir pela Agenda do Dia em vez de remover diretamente daqui.</div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="motivo-remover" className="text-xs">Motivo da remoção (opcional)</Label>
                <Textarea
                  id="motivo-remover"
                  placeholder="Ex.: paciente desistiu, atendido por outro serviço, duplicado…"
                  value={motivoRemover}
                  onChange={(e) => setMotivoRemover(e.target.value.slice(0, 500))}
                  rows={2}
                />
                <div className="text-[10px] text-muted-foreground">
                  Será anexado às observações do item e ficará registrado na auditoria.
                </div>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removendo}
              onClick={(e) => { e.preventDefault(); removerItem && handleRemover(removerItem); }}
            >
              {removendo ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Removendo…</> : "Confirmar remoção"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PullToRefresh>
  );
}

/* ============== Dialog: Adicionar à fila ============== */

function AddFilaDialog({ open, onOpenChange, unidadeId, unidadeNome, userId, especialidades, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  unidadeId: string; unidadeNome: string; userId?: string;
  especialidades: { id: string; nome: string }[];
  onCreated: () => void;
}) {
  const [search, setSearch] = useState("");
  const [paciente, setPaciente] = useState<any>(null);
  const [especialidadeId, setEspecialidadeId] = useState("");
  const [urgencia, setUrgencia] = useState<Urgencia>("normal");
  const [classif, setClassif] = useState<ClassRisco | "">("");
  const [cid10, setCid10] = useState("");
  const [procedimentoId, setProcedimentoId] = useState("");
  const [solNome, setSolNome] = useState("");
  const [solCns, setSolCns] = useState("");
  const [solCbo, setSolCbo] = useState("");
  const [solCnes, setSolCnes] = useState("");
  const [obs, setObs] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch(""); setPaciente(null); setEspecialidadeId(""); setUrgencia("normal");
      setClassif(""); setCid10(""); setProcedimentoId("");
      setSolNome(""); setSolCns(""); setSolCbo(""); setSolCnes(""); setObs("");
    }
  }, [open]);

  const { data: pacResults } = useQuery({
    queryKey: ["pac-search-fila", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const term = search.trim();
      const digits = onlyDigits(term);
      let q = supabase.from("pacientes").select("id, nome, cpf, cns, telefone").limit(10);
      if (digits.length >= 3) q = q.or(`cpf.ilike.%${digits}%,cns.ilike.%${digits}%`);
      else q = q.ilike("nome", `%${term}%`);
      return (await q).data ?? [];
    },
  });

  const { data: procedimentos } = useQuery({
    queryKey: ["fila-procedimentos"],
    queryFn: async () => (await supabase.from("procedimentos").select("id, codigo_sigtap, nome").eq("ativo", true).order("codigo_sigtap")).data ?? [],
  });

  const handleSalvar = async () => {
    if (!paciente || !especialidadeId || !unidadeId) return;
    if (!paciente.cns) return toast.error("CNS do paciente é obrigatório para entrar na regulação. Cadastre o CNS antes.");
    if (!classif) return toast.error("Selecione a classificação de risco.");
    setSubmitting(true);

    const { data: dup } = await (supabase.from(FILA_TABLE as any) as any)
      .select("id")
      .eq("paciente_id", paciente.id)
      .eq("unidade_id", unidadeId)
      .eq("especialidade_id", especialidadeId)
      .in("status", ["aguardando", "agendado"])
      .limit(1)
      .maybeSingle();
    if (dup) {
      setSubmitting(false);
      return toast.error("Paciente já está na fila desta especialidade.");
    }

    const { error } = await (supabase.from(FILA_TABLE as any) as any).insert({
      paciente_id: paciente.id,
      unidade_id: unidadeId,
      especialidade_id: especialidadeId,
      urgencia,
      classificacao_risco: classif,
      cid10: cid10.trim().toUpperCase() || null,
      procedimento_id: procedimentoId || null,
      solicitante_nome: solNome.trim() || null,
      solicitante_cns: onlyDigits(solCns) || null,
      solicitante_cbo: onlyDigits(solCbo) || null,
      solicitante_cnes: onlyDigits(solCnes) || null,
      observacoes: obs || null,
      criado_por: userId ?? null,
    });
    setSubmitting(false);
    if (error) {
      if ((error as any).code === "23505") return toast.error("Paciente já está na fila desta especialidade.");
      if (error.message?.includes("cns_obrigatorio_para_fila")) return toast.error("CNS do paciente é obrigatório.");
      return toast.error(error.message);
    }
    toast.success("Paciente adicionado à fila");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Adicionar à fila</DialogTitle>
          <DialogDescription>Unidade: <strong>{unidadeNome}</strong></DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Paciente</Label>
            {paciente ? (
              <div className="rounded-md border bg-accent/40 p-3">
                <div className="text-sm font-medium">{paciente.nome}</div>
                <div className="text-xs text-muted-foreground">{paciente.cpf ? formatCPF(paciente.cpf) : ""}</div>
                <Button variant="link" size="sm" className="px-0 h-auto" onClick={() => setPaciente(null)}>Trocar paciente</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                </div>
                {pacResults && pacResults.length > 0 && (
                  <ul className="rounded-md border divide-y max-h-48 overflow-y-auto">
                    {pacResults.map((p: any) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setPaciente(p)} className="w-full text-left px-3 py-2 hover:bg-accent">
                          <div className="text-sm font-medium">{p.nome}</div>
                          <div className="text-xs text-muted-foreground">{p.cpf ? formatCPF(p.cpf) : ""}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Especialidade</Label>
            <Select value={especialidadeId} onValueChange={setEspecialidadeId} disabled={especialidades.length === 0}>
              <SelectTrigger><SelectValue placeholder={especialidades.length === 0 ? "Sem especialidades nesta unidade" : "Selecionar"} /></SelectTrigger>
              <SelectContent>
                {especialidades.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Urgência</Label>
            <RadioGroup value={urgencia} onValueChange={(v) => setUrgencia(v as Urgencia)} className="grid grid-cols-3 gap-2">
              {(["normal", "prioritaria", "urgente"] as Urgencia[]).map((u) => (
                <label key={u} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${urgencia === u ? "border-primary bg-accent" : "border-input hover:bg-accent/50"}`}>
                  <RadioGroupItem value={u} />
                  <span>{URGENCIA_LABEL[u]}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observações / encaminhamento</Label>
            <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={!paciente || !especialidadeId || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Check className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== Dialog: Agendar a partir da fila ============== */

function AgendarFilaDialog({ item, onClose, userId, userNome, onDone }: {
  item: any | null; onClose: () => void; userId?: string; userNome: string; onDone: () => void;
}) {
  const open = !!item;
  const [profId, setProfId] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [slot, setSlot] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [comprovanteOpen, setComprovanteOpen] = useState(false);
  const [ultimoAgId, setUltimoAgId] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setProfId(""); setData(format(new Date(), "yyyy-MM-dd")); setSlot(null); }
  }, [open]);

  const { data: profs } = useQuery({
    queryKey: ["fila-profs", item?.unidade_id, item?.especialidade_id],
    enabled: open,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("profissional_unidades")
        .select("profissionais(id, nome, ativo, especialidade_id)")
        .eq("unidade_id", item.unidade_id);
      return (rows ?? [])
        .map((r: any) => r.profissionais)
        .filter((p: any) => p && p.ativo && p.especialidade_id === item.especialidade_id)
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
    },
  });

  useEffect(() => { setSlot(null); }, [profId, data]);

  const { data: slots } = useQuery({
    queryKey: ["fila-slots", profId, data, item?.unidade_id],
    enabled: !!profId && !!data && !!item,
    queryFn: async () => {
      const { data: rows } = await supabase.from("slots")
        .select("id, hora_inicio, hora_fim, status")
        .eq("profissional_id", profId).eq("data", data).eq("unidade_id", item.unidade_id).eq("status", "livre")
        .order("hora_inicio");
      return rows ?? [];
    },
  });

  const handleConfirmar = async () => {
    if (!item || !slot || !profId) return;
    setSubmitting(true);
    const { data: created, error: e2 } = await supabase.from("agendamentos").insert({
      slot_id: slot.id, paciente_id: item.paciente_id, profissional_id: profId, unidade_id: item.unidade_id,
      data, hora_inicio: slot.hora_inicio, criado_por: userId,
      motivo: item.observacoes || null,
    }).select("id").single();
    if (e2 || !created) {
      setSubmitting(false);
      const msg = e2?.message ?? "";
      let friendly = "Erro ao agendar";
      if (msg.includes("slot_indisponivel")) friendly = "Esse horário acabou de ser reservado. Escolha outro.";
      else if (msg.includes("slot_incoerente")) friendly = "Horário inválido para os filtros selecionados.";
      else if (msg.includes("slot_inexistente")) friendly = "Horário não existe mais.";
      else if (msg.toLowerCase().includes("permission")) friendly = "Sem permissão para agendar nesta unidade.";
      else if (msg) friendly = msg;
      return toast.error(friendly);
    }
    const { error: e3 } = await (supabase.from(FILA_TABLE as any) as any)
      .update({ status: "agendado", agendamento_id: created.id }).eq("id", item.id);
    setSubmitting(false);
    if (e3) toast.error("Agendado, mas não foi possível atualizar a fila: " + e3.message);
    else toast.success("Paciente agendado");

    onDone();
    setUltimoAgId(created.id);
    setComprovanteOpen(true);
  };

  const imprimirComprovante = async () => {
    if (!ultimoAgId) return;
    const { data: ag } = await supabase
      .from("agendamentos")
      .select("id, codigo, data, hora_inicio, motivo, pacientes(nome, cpf, cns, telefone), profissionais(nome, especialidades(nome)), unidades(nome, endereco, telefone)")
      .eq("id", ultimoAgId).single();
    if (!ag) return toast.error("Não foi possível carregar o comprovante");
    await gerarComprovante({
      codigo: (ag as any).codigo ?? ag.id, data: ag.data, hora: ag.hora_inicio,
      paciente: {
        nome: (ag.pacientes as any)?.nome ?? "—",
        cpf: (ag.pacientes as any)?.cpf, cns: (ag.pacientes as any)?.cns,
        telefone: (ag.pacientes as any)?.telefone,
      },
      profissional: {
        nome: (ag.profissionais as any)?.nome ?? "—",
        especialidade: (ag.profissionais as any)?.especialidades?.nome,
      },
      unidade: {
        nome: (ag.unidades as any)?.nome ?? "—",
        endereco: (ag.unidades as any)?.endereco,
        telefone: (ag.unidades as any)?.telefone,
      },
      motivo: ag.motivo, emitidoPor: userNome,
    });
  };

  const fecharTudo = () => {
    setComprovanteOpen(false);
    setUltimoAgId(null);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5 text-primary" /> Agendar da fila</DialogTitle>
            <DialogDescription>
              <strong>{item?.pacientes?.nome}</strong> · {item?.especialidades?.nome}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Profissional</Label>
                <Select value={profId} onValueChange={setProfId} disabled={!profs || profs.length === 0}>
                  <SelectTrigger><SelectValue placeholder={!profs || profs.length === 0 ? "Nenhum profissional" : "Selecionar"} /></SelectTrigger>
                  <SelectContent>
                    {(profs ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">Vagas livres</div>
              {!profId ? (
                <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                  Selecione um profissional.
                </div>
              ) : !slots || slots.length === 0 ? (
                <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                  Sem vagas livres nesta data.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 max-h-56 overflow-y-auto">
                  {slots.map((s: any) => (
                    <button key={s.id} type="button" onClick={() => setSlot(s)}
                      className={`min-h-11 rounded-md border px-3 py-2 text-sm transition ${
                        slot?.id === s.id ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                      }`}>{formatTime(s.hora_inicio)}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleConfirmar} disabled={!slot || submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Confirmar agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={comprovanteOpen} onOpenChange={(v) => !v && fecharTudo()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" /> Agendamento criado com sucesso
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja imprimir o comprovante do agendamento agora?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={fecharTudo}>Não, obrigado</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { await imprimirComprovante(); fecharTudo(); }}>
              <FileText className="mr-2 h-4 w-4" /> Sim, imprimir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
