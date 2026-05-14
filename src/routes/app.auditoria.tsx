import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Filter, Loader2, ShieldCheck, Eye, Pencil, Trash2, Plus, LogIn, LogOut, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { logExport } from "@/lib/audit";

function Guard() {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <SemAcesso />;
  return <AuditoriaPage />;
}
export const Route = createFileRoute("/app/auditoria")({ component: Guard });

const ACOES = ["INSERT", "UPDATE", "DELETE", "VIEW", "LOGIN", "LOGOUT", "EXPORT", "DOWNLOAD"] as const;
const TABELAS = [
  "agendamentos", "fila_espera", "pacientes", "slots", "profissionais",
  "agendas_config", "unidades", "especialidades",
  "user_roles", "user_permissions", "user_unidades", "profissional_unidades", "auth",
] as const;
const MODULOS = ["fila", "agendar", "agenda_dia", "pacientes", "profissionais", "agendas", "usuarios", "auditoria", "auth"] as const;

const PAGE_SIZE = 50;

const acaoStyle: Record<string, string> = {
  INSERT: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  UPDATE: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  DELETE: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  VIEW: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  LOGIN: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  LOGOUT: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  EXPORT: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
  DOWNLOAD: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
};
const acaoIcon = (a: string) => {
  switch (a) {
    case "INSERT": return <Plus className="h-3 w-3" />;
    case "UPDATE": return <Pencil className="h-3 w-3" />;
    case "DELETE": return <Trash2 className="h-3 w-3" />;
    case "VIEW": return <Eye className="h-3 w-3" />;
    case "LOGIN": return <LogIn className="h-3 w-3" />;
    case "LOGOUT": return <LogOut className="h-3 w-3" />;
    default: return <FileDown className="h-3 w-3" />;
  }
};

type LogRow = {
  id: string;
  tabela: string;
  registro_id: string | null;
  acao: string;
  before_data: any;
  after_data: any;
  diff: any;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  unidade_id: string | null;
  modulo: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

function periodoToDates(p: string): { from: string | null; to: string | null } {
  const now = new Date();
  if (p === "hoje") {
    const d = format(now, "yyyy-MM-dd");
    return { from: `${d}T00:00:00`, to: `${d}T23:59:59` };
  }
  if (p === "7d" || p === "30d") {
    const days = p === "7d" ? 7 : 30;
    const start = new Date(now); start.setDate(start.getDate() - days);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  return { from: null, to: null };
}

function AuditoriaPage() {
  const [periodo, setPeriodo] = useState("7d");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [tabela, setTabela] = useState("all");
  const [acao, setAcao] = useState("all");
  const [modulo, setModulo] = useState("all");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const range = useMemo(() => {
    if (periodo === "custom") return { from: from || null, to: to || null };
    return periodoToDates(periodo);
  }, [periodo, from, to]);

  const filtros = useMemo(() => ({
    periodo, from: range.from, to: range.to, tabela, acao, modulo, busca,
  }), [periodo, range, tabela, acao, modulo, busca]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", filtros, page],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (range.from) q = q.gte("created_at", range.from);
      if (range.to) q = q.lte("created_at", range.to);
      if (tabela !== "all") q = q.eq("tabela", tabela);
      if (acao !== "all") q = q.eq("acao", acao);
      if (modulo !== "all") q = q.eq("modulo", modulo);
      if (busca.trim()) q = q.or(`user_email.ilike.%${busca}%,registro_id.eq.${busca}`.replaceAll(",registro_id.eq.", busca.match(/^[0-9a-f-]{36}$/) ? ",registro_id.eq." : ",user_email.ilike.%"));

      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as LogRow[], total: count ?? 0 };
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  async function exportCsv() {
    let q = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50000);
    if (range.from) q = q.gte("created_at", range.from);
    if (range.to) q = q.lte("created_at", range.to);
    if (tabela !== "all") q = q.eq("tabela", tabela);
    if (acao !== "all") q = q.eq("acao", acao);
    if (modulo !== "all") q = q.eq("modulo", modulo);
    if (busca.trim()) q = q.ilike("user_email", `%${busca}%`);

    const { data, error } = await q;
    if (error) return;
    const rows = (data ?? []) as LogRow[];
    const head = ["created_at","acao","tabela","registro_id","modulo","user_email","user_role","ip","user_agent","diff"];
    const csv = [head.join(",")].concat(
      rows.map((r) => head.map((k) => {
        const v = (r as any)[k];
        const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
        return `"${s.replaceAll('"', '""')}"`;
      }).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit_logs_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    void logExport("audit_logs", "auditoria", filtros);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" /> Central de Auditoria (LGPD)
              </CardTitle>
              <CardDescription>Registro completo e imutável de todas as operações sensíveis.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <Filter className="mr-2 h-4 w-4" /> Atualizar
              </Button>
              <Button size="sm" onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" /> Exportar CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label className="text-xs">Período</Label>
              <Select value={periodo} onValueChange={(v) => { setPeriodo(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="all">Todo período</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodo === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">De</Label>
                  <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Até</Label>
                  <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Ação</Label>
              <Select value={acao} onValueChange={(v) => { setAcao(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ACOES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tabela</Label>
              <Select value={tabela} onValueChange={(v) => { setTabela(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {TABELAS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Módulo</Label>
              <Select value={modulo} onValueChange={(v) => { setModulo(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {MODULOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <Label className="text-xs">Buscar (e-mail ou ID do registro)</Label>
              <Input value={busca} onChange={(e) => { setBusca(e.target.value); setPage(0); }} placeholder="usuario@dominio ou UUID..." />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Quando</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Tabela</TableHead>
                  <TableHead className="hidden md:table-cell">Registro</TableHead>
                  <TableHead className="hidden md:table-cell">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Carregando…
                  </TableCell></TableRow>
                ) : !data?.rows.length ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nenhum registro encontrado.
                  </TableCell></TableRow>
                ) : data.rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelected(r)}>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.created_at), "dd/MM/yy HH:mm:ss")}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{r.user_email ?? "—"}</div>
                      <div className="text-muted-foreground">{r.user_role ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 ${acaoStyle[r.acao] ?? ""}`}>
                        {acaoIcon(r.acao)} {r.acao}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.modulo ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.tabela}</TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-[10px] text-muted-foreground">{r.registro_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{r.ip ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <div>Total: {data?.total ?? 0}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Anterior
              </Button>
              <span>Página {page + 1} de {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Badge variant="outline" className={`gap-1 ${acaoStyle[selected.acao] ?? ""}`}>
                    {acaoIcon(selected.acao)} {selected.acao}
                  </Badge>
                  {selected.tabela}
                </SheetTitle>
                <SheetDescription>
                  {format(new Date(selected.created_at), "dd/MM/yyyy HH:mm:ss")} · {selected.user_email ?? "—"} ({selected.user_role ?? "—"})
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-xs">
                  <div><span className="text-muted-foreground">Módulo:</span> {selected.modulo ?? "—"}</div>
                  <div><span className="text-muted-foreground">Registro:</span> <span className="font-mono">{selected.registro_id ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">IP:</span> {selected.ip ?? "—"}</div>
                  <div className="col-span-2 truncate"><span className="text-muted-foreground">Navegador:</span> {selected.user_agent ?? "—"}</div>
                </div>

                {selected.acao === "UPDATE" && selected.diff && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Alterações</h4>
                    <div className="space-y-2">
                      {Object.entries(selected.diff).map(([campo, val]: any) => (
                        <div key={campo} className="rounded-md border bg-card p-2 text-xs">
                          <div className="mb-1 font-semibold">{campo}</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded bg-rose-500/10 p-2">
                              <div className="text-[10px] uppercase text-rose-700">Antes</div>
                              <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(val.before, null, 2)}</pre>
                            </div>
                            <div className="rounded bg-emerald-500/10 p-2">
                              <div className="text-[10px] uppercase text-emerald-700">Depois</div>
                              <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(val.after, null, 2)}</pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.acao === "INSERT" && selected.after_data && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Dados criados</h4>
                    <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{JSON.stringify(selected.after_data, null, 2)}</pre>
                  </div>
                )}

                {selected.acao === "DELETE" && selected.before_data && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Dados removidos</h4>
                    <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{JSON.stringify(selected.before_data, null, 2)}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
