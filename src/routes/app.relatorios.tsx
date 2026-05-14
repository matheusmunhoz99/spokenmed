import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
import { logExport } from "@/lib/audit";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

function Guard() {
  const { can } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!can("relatorios")) return <SemAcesso />;
  if (!mounted) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando relatórios…</div>;
  return <RelatoriosPage />;
}

export const Route = createFileRoute("/app/relatorios")({ component: Guard });

const STATUS_COLORS: Record<string, string> = {
  agendado: "hsl(217 91% 60%)",
  confirmado: "hsl(142 71% 45%)",
  atendido: "hsl(160 84% 39%)",
  faltou: "hsl(38 92% 50%)",
  cancelado: "hsl(0 84% 60%)",
};
const URG_COLORS: Record<string, string> = {
  normal: "hsl(217 91% 60%)",
  prioritaria: "hsl(38 92% 50%)",
  urgente: "hsl(0 84% 60%)",
};

const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendados", confirmado: "Confirmados", atendido: "Atendidos",
  faltou: "Faltas", cancelado: "Cancelados",
};

function csvEscape(v: any) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, rows: any[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(";"), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function RelatoriosPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const d30 = format(subDays(new Date(), 29), "yyyy-MM-dd");

  const [from, setFrom] = useState(d30);
  const [to, setTo] = useState(today);
  const [unidadeId, setUnidadeId] = useState<string>("all");
  const [profId, setProfId] = useState<string>("all");
  const [espId, setEspId] = useState<string>("all");
  const [procId, setProcId] = useState<string>("all");

  const { data: unidades } = useAllowedUnidades();
  const allowedIds = useMemo(() => (unidades ?? []).map((u: any) => u.id), [unidades]);

  const { data: especialidades } = useQuery({
    queryKey: ["esp-rel"],
    queryFn: async () => {
      const { data, error } = await supabase.from("especialidades").select("id,nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: procedimentos } = useQuery({
    queryKey: ["proc-rel"],
    queryFn: async () => {
      const { data, error } = await supabase.from("procedimentos").select("id,codigo_sigtap,nome").eq("ativo", true).order("codigo_sigtap");
      if (error) throw error;
      return data;
    },
  });

  const { data: profs } = useQuery({
    queryKey: ["profs-rel", unidadeId, espId, allowedIds.join(",")],
    enabled: !!unidades,
    queryFn: async () => {
      let q = supabase.from("profissionais").select("id,nome,especialidade_id").eq("ativo", true).order("nome");
      if (espId !== "all") q = q.eq("especialidade_id", espId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Agendamentos no período
  const { data: ags, isLoading: loadingAgs } = useQuery({
    queryKey: ["rel-ags", from, to, unidadeId, profId, espId, procId, allowedIds.join(",")],
    enabled: !!unidades,
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select("id,data,status,is_encaixe,unidade_id,profissional_id,procedimento_id,profissionais(nome,especialidade_id,especialidades(nome)),unidades(nome),procedimentos(codigo_sigtap,nome)")
        .gte("data", from)
        .lte("data", to)
        .order("data", { ascending: true })
        .limit(5000);
      if (unidadeId !== "all") q = q.eq("unidade_id", unidadeId);
      else if (allowedIds.length) q = q.in("unidade_id", allowedIds);
      if (profId !== "all") q = q.eq("profissional_id", profId);
      if (procId !== "all") q = q.eq("procedimento_id", procId);
      const { data, error } = await q;
      if (error) throw error;
      let rows = data ?? [];
      if (espId !== "all") rows = rows.filter((r: any) => r.profissionais?.especialidade_id === espId);
      return rows;
    },
  });

  // Fila atual
  const { data: fila, isLoading: loadingFila } = useQuery({
    queryKey: ["rel-fila", unidadeId, espId, allowedIds.join(",")],
    enabled: !!unidades,
    queryFn: async () => {
      let q = supabase
        .from("fila_espera")
        .select("id,urgencia,status,created_at,unidade_id,especialidade_id,especialidades(nome),unidades(nome)")
        .eq("status", "aguardando")
        .limit(5000);
      if (unidadeId !== "all") q = q.eq("unidade_id", unidadeId);
      else if (allowedIds.length) q = q.in("unidade_id", allowedIds);
      if (espId !== "all") q = q.eq("especialidade_id", espId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // KPIs
  const kpis = useMemo(() => {
    const a = ags ?? [];
    const total = a.length;
    const by = (s: string) => a.filter((r: any) => r.status === s).length;
    const atendidos = by("atendido");
    const faltas = by("faltou");
    const cancel = by("cancelado");
    const finalizados = atendidos + faltas;
    const absent = finalizados ? (faltas / finalizados) * 100 : 0;
    const taxaAt = finalizados ? (atendidos / finalizados) * 100 : 0;
    const encaixes = a.filter((r: any) => r.is_encaixe).length;
    return { total, atendidos, faltas, cancel, absent, taxaAt, encaixes, fila: fila?.length ?? 0 };
  }, [ags, fila]);

  // Produção por dia
  const porDia = useMemo(() => {
    const m = new Map<string, any>();
    (ags ?? []).forEach((r: any) => {
      const k = r.data;
      if (!m.has(k)) m.set(k, { data: k, agendado: 0, confirmado: 0, atendido: 0, faltou: 0, cancelado: 0 });
      m.get(k)[r.status]++;
    });
    return Array.from(m.values());
  }, [ags]);

  // Distribuição de status
  const porStatus = useMemo(() => {
    const counts: Record<string, number> = { agendado: 0, confirmado: 0, atendido: 0, faltou: 0, cancelado: 0 };
    (ags ?? []).forEach((r: any) => { counts[r.status] = (counts[r.status] ?? 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({ name: STATUS_LABEL[k], key: k, value: v }));
  }, [ags]);

  // Por profissional
  const porProf = useMemo(() => {
    const m = new Map<string, any>();
    (ags ?? []).forEach((r: any) => {
      const k = r.profissional_id;
      if (!m.has(k)) m.set(k, {
        profissional: r.profissionais?.nome ?? "—",
        especialidade: r.profissionais?.especialidades?.nome ?? "—",
        total: 0, atendidos: 0, faltas: 0, cancelados: 0,
      });
      const o = m.get(k);
      o.total++;
      if (r.status === "atendido") o.atendidos++;
      if (r.status === "faltou") o.faltas++;
      if (r.status === "cancelado") o.cancelados++;
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [ags]);

  // Por especialidade
  const porEsp = useMemo(() => {
    const m = new Map<string, any>();
    (ags ?? []).forEach((r: any) => {
      const k = r.profissionais?.especialidades?.nome ?? "Sem especialidade";
      if (!m.has(k)) m.set(k, { especialidade: k, total: 0, atendidos: 0, faltas: 0, cancelados: 0 });
      const o = m.get(k);
      o.total++;
      if (r.status === "atendido") o.atendidos++;
      if (r.status === "faltou") o.faltas++;
      if (r.status === "cancelado") o.cancelados++;
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [ags]);

  // Fila por especialidade
  const filaEsp = useMemo(() => {
    const m = new Map<string, any>();
    (fila ?? []).forEach((r: any) => {
      const k = r.especialidades?.nome ?? "—";
      if (!m.has(k)) m.set(k, { especialidade: k, normal: 0, prioritaria: 0, urgente: 0, total: 0 });
      const o = m.get(k);
      o[r.urgencia]++;
      o.total++;
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [fila]);

  // Fila tempo médio de espera (dias)
  const filaTempoMedio = useMemo(() => {
    const arr = fila ?? [];
    if (!arr.length) return 0;
    const now = Date.now();
    const sum = arr.reduce((acc: number, r: any) => acc + (now - new Date(r.created_at).getTime()), 0);
    return Math.round(sum / arr.length / (1000 * 60 * 60 * 24));
  }, [fila]);

  function exportProducao() {
    const rows = (ags ?? []).map((r: any) => ({
      data: r.data,
      status: r.status,
      profissional: r.profissionais?.nome ?? "",
      especialidade: r.profissionais?.especialidades?.nome ?? "",
      unidade: r.unidades?.nome ?? "",
      procedimento_sigtap: r.procedimentos?.codigo_sigtap ?? "",
      procedimento_nome: r.procedimentos?.nome ?? "",
      encaixe: r.is_encaixe ? "sim" : "nao",
    }));
    downloadCsv(`producao_${from}_a_${to}.csv`, rows);
    logExport("agendamentos", "relatorios", { from, to, unidadeId, profId, espId, procId });
  }
  function exportFila() {
    const rows = (fila ?? []).map((r: any) => ({
      criado_em: r.created_at,
      urgencia: r.urgencia,
      especialidade: r.especialidades?.nome ?? "",
      unidade: r.unidades?.nome ?? "",
    }));
    downloadCsv(`fila_${format(new Date(), "yyyy-MM-dd")}.csv`, rows);
    logExport("fila_espera", "relatorios", { unidadeId, espId });
  }
  function exportProf() {
    downloadCsv(`producao_por_profissional_${from}_a_${to}.csv`, porProf);
    logExport("agendamentos", "relatorios", { agg: "profissional", from, to, unidadeId, profId, espId });
  }
  function exportEsp() {
    downloadCsv(`producao_por_especialidade_${from}_a_${to}.csv`, porEsp);
    logExport("agendamentos", "relatorios", { agg: "especialidade", from, to, unidadeId, profId, espId });
  }

  const loading = loadingAgs || loadingFila;
  const truncated = (ags?.length ?? 0) >= 5000 || (fila?.length ?? 0) >= 5000;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div>
            <Label>De</Label>
            <Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <Label>Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(unidades ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Especialidade</Label>
            <Select value={espId} onValueChange={(v) => { setEspId(v); setProfId("all"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(especialidades ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Profissional</Label>
            <Select value={profId} onValueChange={setProfId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(profs ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Procedimento (SIGTAP)</Label>
            <Select value={procId} onValueChange={setProcId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(procedimentos ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.codigo_sigtap} — {p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {truncated && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Resultado limitado a 5.000 registros. Refine os filtros (período/unidade) para análise mais precisa.
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Total no período" value={kpis.total} />
        <Kpi label="Atendidos" value={kpis.atendidos} accent="text-emerald-600" />
        <Kpi label="Faltas (absenteísmo)" value={`${kpis.absent.toFixed(1)}%`} sub={`${kpis.faltas} faltas`} accent="text-amber-600" />
        <Kpi label="Cancelamentos" value={kpis.cancel} accent="text-rose-600" />
        <Kpi label="Taxa de atendimento" value={`${kpis.taxaAt.toFixed(1)}%`} sub="atendidos / (atendidos+faltas)" />
        <Kpi label="Encaixes" value={kpis.encaixes} accent="text-amber-700" />
        <Kpi label="Aguardando na fila" value={kpis.fila} accent="text-blue-600" />
        <Kpi label="Espera média (fila)" value={`${filaTempoMedio} d`} />
      </div>

      <Tabs defaultValue="producao">
        <TabsList>
          <TabsTrigger value="producao">Produção</TabsTrigger>
          <TabsTrigger value="profissional">Por Profissional</TabsTrigger>
          <TabsTrigger value="especialidade">Por Especialidade</TabsTrigger>
          <TabsTrigger value="fila">Fila</TabsTrigger>
        </TabsList>

        <TabsContent value="producao" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Produção por dia</CardTitle>
              <Button size="sm" variant="outline" onClick={exportProducao}><Download className="mr-1 h-4 w-4" /> CSV</Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skel />
              ) : porDia.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={porDia} stackOffset="sign">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    {Object.keys(STATUS_LABEL).map(k => (
                      <Bar key={k} dataKey={k} stackId="s" fill={STATUS_COLORS[k]} name={STATUS_LABEL[k]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Distribuição por status</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skel /> : porStatus.every(s => s.value === 0) ? <Empty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={porStatus.filter(s => s.value > 0)} dataKey="value" nameKey="name" label outerRadius={100}>
                      {porStatus.map(s => <Cell key={s.key} fill={STATUS_COLORS[s.key]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profissional">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Produção por profissional</CardTitle>
              <Button size="sm" variant="outline" onClick={exportProf}><Download className="mr-1 h-4 w-4" /> CSV</Button>
            </CardHeader>
            <CardContent>
              {loading ? <Skel /> : porProf.length === 0 ? <Empty /> : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr>
                      <th className="px-2 py-1">Profissional</th><th className="px-2 py-1">Especialidade</th>
                      <th className="px-2 py-1 text-right">Total</th><th className="px-2 py-1 text-right">Atendidos</th>
                      <th className="px-2 py-1 text-right">Faltas</th><th className="px-2 py-1 text-right">Cancelados</th>
                      <th className="px-2 py-1 text-right">Absent.</th>
                    </tr></thead>
                    <tbody>
                      {porProf.map((r, i) => {
                        const fin = r.atendidos + r.faltas;
                        const ab = fin ? (r.faltas / fin) * 100 : 0;
                        return (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1.5">{r.profissional}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.especialidade}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{r.total}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-emerald-700">{r.atendidos}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-amber-700">{r.faltas}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-rose-700">{r.cancelados}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{ab.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="especialidade">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Produção por especialidade</CardTitle>
              <Button size="sm" variant="outline" onClick={exportEsp}><Download className="mr-1 h-4 w-4" /> CSV</Button>
            </CardHeader>
            <CardContent>
              {loading ? <Skel /> : porEsp.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={Math.max(220, porEsp.length * 32)}>
                  <BarChart data={porEsp} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="especialidade" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip /><Legend />
                    <Bar dataKey="atendidos" stackId="s" fill={STATUS_COLORS.atendido} name="Atendidos" />
                    <Bar dataKey="faltas" stackId="s" fill={STATUS_COLORS.faltou} name="Faltas" />
                    <Bar dataKey="cancelados" stackId="s" fill={STATUS_COLORS.cancelado} name="Cancelados" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fila" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Fila aguardando · por especialidade & urgência</CardTitle>
              <Button size="sm" variant="outline" onClick={exportFila}><Download className="mr-1 h-4 w-4" /> CSV</Button>
            </CardHeader>
            <CardContent>
              {loading ? <Skel /> : filaEsp.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={Math.max(220, filaEsp.length * 32)}>
                  <BarChart data={filaEsp} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="especialidade" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip /><Legend />
                    <Bar dataKey="urgente" stackId="s" fill={URG_COLORS.urgente} name="Urgente" />
                    <Bar dataKey="prioritaria" stackId="s" fill={URG_COLORS.prioritaria} name="Prioritária" />
                    <Bar dataKey="normal" stackId="s" fill={URG_COLORS.normal} name="Normal" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: any; sub?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Skel() {
  return <LoadingState variant="chart" />;
}
function Empty() {
  return <EmptyState icon={BarChart3} title="Sem dados" description="Nenhum registro para os filtros selecionados." compact />;
}
