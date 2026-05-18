import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogIn, Activity, Stethoscope, Megaphone, Search, Clock } from "lucide-react";
import { format, differenceInYears } from "date-fns";
import { formatTime } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { SemAcesso } from "@/components/sem-acesso";
import { StatusBadge } from "./app.index";
import { ChamarDialog } from "@/components/chamar-dialog";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

function Guard() {
  const { can } = useAuth();
  if (!can("recepcao")) return <SemAcesso />;
  return <RecepcaoPage />;
}

export const Route = createFileRoute("/app/recepcao")({ component: Guard });

type SortKey = "chegada" | "nome" | "idade" | "hora";

function RecepcaoPage() {
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const canManage = can("recepcao", "manage");
  const [today] = useState(format(new Date(), "yyyy-MM-dd"));
  const [unidadeId, setUnidadeId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("chegada");
  const [chamar, setChamar] = useState<any>(null);
  const [, force] = useState(0);

  // tick para tempo de espera ao vivo
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  const { data: unidades } = useAllowedUnidades();
  const allowedIds = useMemo(() => (unidades ?? []).map((u: any) => u.id), [unidades]);

  const { data: ags, isLoading } = useQuery({
    queryKey: ["recepcao", today, unidadeId, allowedIds.join(",")],
    enabled: !!unidades,
    queryFn: async () => {
      let q = supabase.from("agendamentos")
        .select("id, hora_inicio, status, motivo, unidade_id, chegou_em, triagem_em, atendido_em, pacientes(nome, cpf, telefone, data_nascimento), profissionais(id, nome, especialidades(nome)), unidades(nome)")
        .eq("data", today);
      if (unidadeId !== "all") q = q.eq("unidade_id", unidadeId);
      else if (allowedIds.length > 0) q = q.in("unidade_id", allowedIds);
      return (await q).data ?? [];
    },
  });

  // realtime
  useEffect(() => {
    const ch = supabase.channel("recepcao-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos" },
        () => qc.invalidateQueries({ queryKey: ["recepcao"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const updateStatus = async (a: any, status: string) => {
    const { error } = await supabase.from("agendamentos").update({ status: status as any }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    qc.invalidateQueries({ queryKey: ["recepcao"] });
  };

  const counts = useMemo(() => {
    const acc = { agendado: 0, confirmado: 0, chegou: 0, em_triagem: 0, atendido: 0, faltou: 0, cancelado: 0 };
    (ags ?? []).forEach((a: any) => { (acc as any)[a.status] = ((acc as any)[a.status] ?? 0) + 1; });
    return acc;
  }, [ags]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const onlyDigits = term.replace(/\D/g, "");
    const list = (ags ?? []).filter((a: any) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (term) {
        const nome = a.pacientes?.nome?.toLowerCase() ?? "";
        const cpf = (a.pacientes?.cpf ?? "").replace(/\D/g, "");
        if (!nome.includes(term) && !(onlyDigits && cpf.includes(onlyDigits))) return false;
      }
      return true;
    });
    const idade = (dn?: string) => (dn ? differenceInYears(new Date(), new Date(dn)) : -1);
    list.sort((a: any, b: any) => {
      switch (sort) {
        case "nome": return (a.pacientes?.nome ?? "").localeCompare(b.pacientes?.nome ?? "");
        case "idade": return idade(b.pacientes?.data_nascimento) - idade(a.pacientes?.data_nascimento);
        case "hora": return (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "");
        case "chegada":
        default: {
          // chegou_em ASC; quem não chegou vai para o fim (ordenado por hora marcada)
          if (a.chegou_em && b.chegou_em) return a.chegou_em.localeCompare(b.chegou_em);
          if (a.chegou_em) return -1;
          if (b.chegou_em) return 1;
          return (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "");
        }
      }
    });
    return list;
  }, [ags, statusFilter, search, sort]);

  const ordemMap = useMemo(() => {
    // numero de ordem de chegada apenas para quem já chegou
    const arr = (ags ?? [])
      .filter((a: any) => !!a.chegou_em)
      .sort((a: any, b: any) => a.chegou_em.localeCompare(b.chegou_em));
    const m = new Map<string, number>();
    arr.forEach((a: any, i: number) => m.set(a.id, i + 1));
    return m;
  }, [ags]);

  const fmtWait = (iso?: string | null) => {
    if (!iso) return "—";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60); const m = mins % 60;
    return `${h}h${m.toString().padStart(2, "0")}`;
  };

  const idadeStr = (dn?: string | null) => {
    if (!dn) return "—";
    const y = differenceInYears(new Date(), new Date(dn));
    return `${y}a`;
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Agendados" value={counts.agendado + counts.confirmado} tone="muted" />
        <KpiCard label="Chegaram" value={counts.chegou} tone="sky" />
        <KpiCard label="Em triagem" value={counts.em_triagem} tone="violet" />
        <KpiCard label="Atendidos" value={counts.atendido} tone="success" />
        <KpiCard label="Faltaram" value={counts.faltou} tone="warning" />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="grid gap-3 p-3 sm:p-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Buscar paciente</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou CPF" className="pl-8" />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Unidade</div>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {unidades?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Status</div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="agendado">Aguardando recepção</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="chegou">Chegou</SelectItem>
                <SelectItem value="em_triagem">Em triagem</SelectItem>
                <SelectItem value="atendido">Atendido</SelectItem>
                <SelectItem value="faltou">Faltou</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Ordenar por</div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chegada">Ordem de chegada</SelectItem>
                <SelectItem value="hora">Hora marcada</SelectItem>
                <SelectItem value="nome">Nome do paciente</SelectItem>
                <SelectItem value="idade">Idade (maior → menor)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recepção do dia · {filtered.length} pacientes</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState variant="list" rows={6} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Clock} title="Sem pacientes no filtro" description="Ajuste os filtros ou marque chegadas na agenda do dia." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Idade</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Espera</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a: any) => {
                    const ord = ordemMap.get(a.id);
                    const baseEspera = a.status === "em_triagem" ? a.triagem_em : a.chegou_em;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-sm">{ord ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{formatTime(a.hora_inicio)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{a.pacientes?.nome}</div>
                          <div className="text-xs text-muted-foreground">{a.unidades?.nome}</div>
                        </TableCell>
                        <TableCell className="text-sm">{idadeStr(a.pacientes?.data_nascimento)}</TableCell>
                        <TableCell className="text-sm">
                          {a.profissionais?.nome}
                          {a.profissionais?.especialidades?.nome && <Badge variant="outline" className="ml-1 text-[10px]">{a.profissionais.especialidades.nome}</Badge>}
                        </TableCell>
                        <TableCell><StatusBadge status={a.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtWait(baseEspera)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1">
                            {canManage && (a.status === "agendado" || a.status === "confirmado") && (
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => updateStatus(a, "chegou")}>
                                <LogIn className="h-3.5 w-3.5" /> Chegou
                              </Button>
                            )}
                            {canManage && a.status === "chegou" && (
                              <Button size="sm" variant="outline" className="gap-1 text-violet-700" onClick={() => updateStatus(a, "em_triagem")}>
                                <Activity className="h-3.5 w-3.5" /> Triagem
                              </Button>
                            )}
                            {canManage && a.status === "em_triagem" && (
                              <Button size="sm" variant="outline" className="gap-1 text-emerald-700" onClick={() => updateStatus(a, "confirmado")}>
                                <Stethoscope className="h-3.5 w-3.5" /> Liberar
                              </Button>
                            )}
                            {a.unidade_id && canManage && (
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Chamar no painel" onClick={() => setChamar(a)}>
                                <Megaphone className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ChamarDialog
        open={!!chamar}
        onOpenChange={(v) => !v && setChamar(null)}
        agendamento={chamar}
        userId={user?.id}
      />
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: "muted" | "sky" | "violet" | "success" | "warning" }) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
        <div className={`h-9 w-9 rounded-md ${cls}`} />
      </CardContent>
    </Card>
  );
}
