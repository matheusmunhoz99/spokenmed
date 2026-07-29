import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, RefreshCw, Search, Download, Network } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

function Guard() {
  const { can, isAdmin } = useAuth();
  if (!isAdmin && !can("regulacao")) return <SemAcesso />;
  return <EncaminhamentosPage />;
}

export const Route = createFileRoute("/app/encaminhamentos")({ component: Guard });

type Row = Record<string, any>;
type Registro = { id: string; chave_origem: string | null; created_at: string; payload: Row };

/** Impede que bytes inválidos do sistema legado apareçam como � na interface. */
function limparTextoLegado(value: string) {
  return value
    .replace(/\uFFFD/g, "")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã£/g, "ã")
    .replace(/Ãµ/g, "õ")
    .replace(/Ã§/g, "ç")
    .replace(/Ã/g, "Á")
    .replace(/Ã‰/g, "É")
    .replace(/Ã“/g, "Ó")
    .replace(/Ãš/g, "Ú")
    .replace(/Ãƒ/g, "Ã")
    .replace(/Ã‡/g, "Ç");
}

function limparPayloadLegado(value: unknown): unknown {
  if (typeof value === "string") return limparTextoLegado(value);
  if (Array.isArray(value)) return value.map(limparPayloadLegado);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        limparPayloadLegado(item),
      ]),
    );
  }
  return value;
}

/** Lê um campo do payload aceitando variações de caixa. */
function f(p: Row, ...keys: string[]) {
  for (const k of keys) {
    const v = p[k] ?? p[k.toUpperCase()] ?? p[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function txt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  return limparTextoLegado(String(v));
}

function fmtData(v: any) {
  if (!v) return "—";
  const texto = String(v).trim();
  const dataIso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (dataIso) return `${dataIso[3]}/${dataIso[2]}/${dataIso[1]}`;
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("pt-BR");
}

function prioridadeBadge(p: any) {
  const s = String(p ?? "").toLowerCase();
  if (!s || s === "null") return null;
  const cls = s.includes("urg") || s.includes("1")
    ? "bg-red-600 text-white"
    : s.includes("prior") || s.includes("2")
      ? "bg-amber-500 text-black"
      : "bg-slate-500 text-white";
  return <Badge className={cls}>{String(p)}</Badge>;
}

function EncaminhamentosPage() {
  const PAGE_SIZE = 100;
  const [pagina, setPagina] = useState(0);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [especialidade, setEspecialidade] = useState("todas");
  const [unidade, setUnidade] = useState("todas");
  const [detalhe, setDetalhe] = useState<Registro | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["integracao", "encaminhamentos", pagina],
    queryFn: async () => {
      const inicio = pagina * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("integracao_registros")
        .select("id, chave_origem, created_at, payload", { count: "exact" })
        .ilike("tabela", "ENCAMINHAMENTO")
        .order("created_at", { ascending: false })
        .range(inicio, inicio + PAGE_SIZE - 1);
      if (error) throw error;
      return {
        registros: (data ?? []).map((registro) => ({
          ...registro,
          payload: limparPayloadLegado(registro.payload) as Row,
        })) as unknown as Registro[],
        total: count ?? 0,
      };
    },
  });

  const registros = data?.registros ?? [];
  const totalRegistros = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / PAGE_SIZE));

  const opcoes = useMemo(() => {
    const tipos = new Set<string>();
    const esps = new Set<string>();
    const unis = new Set<string>();
    for (const r of registros) {
      const t = f(r.payload, "ENCAMINHAMENTO_TIPO", "FLG_TIPO");
      const e = f(r.payload, "ESPECIALIDADE_NOME");
      const u = f(r.payload, "UNIDADE_NOME");
      if (t) tipos.add(String(t));
      if (e) esps.add(String(e));
      if (u) unis.add(String(u));
    }
    return {
      tipos: [...tipos].sort(),
      esps: [...esps].sort(),
      unis: [...unis].sort(),
    };
  }, [registros]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return registros.filter((r) => {
      const p = r.payload;
      if (tipo !== "todos" && String(f(p, "ENCAMINHAMENTO_TIPO", "FLG_TIPO") ?? "") !== tipo) return false;
      if (especialidade !== "todas" && String(f(p, "ESPECIALIDADE_NOME") ?? "") !== especialidade) return false;
      if (unidade !== "todas" && String(f(p, "UNIDADE_NOME") ?? "") !== unidade) return false;
      if (!q) return true;
      return JSON.stringify(p).toLowerCase().includes(q);
    });
  }, [registros, busca, tipo, especialidade, unidade]);

  function exportarCsv() {
    if (!filtrados.length) return;
    const cols = Array.from(
      filtrados.reduce((set, r) => {
        Object.keys(r.payload).forEach((k) => set.add(k));
        return set;
      }, new Set<string>()),
    );
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [cols.join(";"), ...filtrados.map((r) => cols.map((c) => esc(r.payload[c])).join(";"))];
    const blob = new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `encaminhamentos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Network className="h-5 w-5" /> Encaminhamentos / Regulação
          </h1>
          <p className="text-sm text-muted-foreground">
            Guias recebidas do sistema legado, aguardando regulação (sem agenda e não reguladas).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!filtrados.length}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Guias recebidas</div><div className="text-2xl font-semibold">{totalRegistros.toLocaleString("pt-BR")}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Após filtros</div><div className="text-2xl font-semibold">{filtrados.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Especialidades</div><div className="text-2xl font-semibold">{opcoes.esps.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Unidades solicitantes</div><div className="text-2xl font-semibold">{opcoes.unis.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fila de regulação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por paciente, guia, médico, serviço..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select value={especialidade} onValueChange={setEspecialidade}>
              <SelectTrigger><SelectValue placeholder="Especialidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as especialidades</SelectItem>
                {opcoes.esps.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as unidades</SelectItem>
                {opcoes.unis.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
            {opcoes.tipos.length > 0 && (
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {opcoes.tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {isLoading ? (
            <LoadingState />
          ) : !filtrados.length ? (
            <EmptyState
              title="Nenhum encaminhamento"
              description="Assim que o integrador enviar a tabela ENCAMINHAMENTO, as guias aparecem aqui."
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guia</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Idade</TableHead>
                    <TableHead>Especialidade / Serviço</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((r) => {
                    const p = r.payload;
                    const cor = f(p, "STATUS_COR");
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{txt(f(p, "ID_GUIA_ENCA") ?? r.chave_origem)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{txt(f(p, "PACIENTE_NOME"))}</div>
                          <div className="text-xs text-muted-foreground">
                            CNS {txt(f(p, "PACIENTE_CARTAO"))} · {txt(f(p, "PACIENTE_SEXO"))}
                          </div>
                        </TableCell>
                        <TableCell>{txt(f(p, "PACIENTE_IDADE"))}</TableCell>
                        <TableCell>
                          <div>{txt(f(p, "ESPECIALIDADE_NOME", "ENCAMINHAMENTO_DESCRICAO"))}</div>
                          <div className="text-xs text-muted-foreground">{txt(f(p, "SERVICO_DESCRICAO"))}</div>
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate">{txt(f(p, "UNIDADE_NOME"))}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{txt(f(p, "MEDICO_NOME"))}</TableCell>
                        <TableCell>
                          {f(p, "STATUS_DESCRICAO") ? (
                            <Badge
                              variant="outline"
                              style={cor ? { borderColor: String(cor), color: String(cor) } : undefined}
                            >
                              {String(f(p, "STATUS_DESCRICAO"))}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{prioridadeBadge(f(p, "VAGA_PRIORIDADE", "TIPO_VAGA")) ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {fmtData(
                            f(
                              p,
                              "DT_GUIA_ENCA",
                              "DT_GUIA_CADASTRO",
                              "DT_ENCAMINHAMENTO",
                              "DATA_ENCA",
                              "DT_ENCA",
                              "DATA",
                              "DT_CADASTRO",
                            ) ?? r.created_at,
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setDetalhe(r)} aria-label="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Página {pagina + 1} de {totalPaginas} · exibindo {registros.length} de{" "}
                  {totalRegistros.toLocaleString("pt-BR")} guias
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagina === 0 || isFetching}
                    onClick={() => setPagina((p) => Math.max(0, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagina + 1 >= totalPaginas || isFetching}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Guia {txt(detalhe && f(detalhe.payload, "ID_GUIA_ENCA"))}</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Paciente", f(detalhe.payload, "PACIENTE_NOME")],
                  ["Nascimento", fmtData(f(detalhe.payload, "PACIENTE_DATANASCIMENTO"))],
                  ["Data do encaminhamento", fmtData(f(detalhe.payload, "DT_GUIA_ENCA", "DT_GUIA_CADASTRO"))],
                  ["Mãe", f(detalhe.payload, "PACIENTE_MAE")],
                  ["Pai", f(detalhe.payload, "PACIENTE_PAI")],
                  ["RG", f(detalhe.payload, "PACIENTE_RG")],
                  ["Cartão SUS", f(detalhe.payload, "PACIENTE_CARTAO")],
                  ["Celular", f(detalhe.payload, "PACIENTE_CELULAR")],
                  ["Telefones", [f(detalhe.payload, "PACIENTE_FONE"), f(detalhe.payload, "PACIENTE_FONE2")].filter(Boolean).join(" / ")],
                  ["Unidade", f(detalhe.payload, "UNIDADE_NOME")],
                  ["Profissional", f(detalhe.payload, "MEDICO_NOME")],
                  ["CBO", f(detalhe.payload, "CBO_DESCRICAO")],
                  ["Especialidade", f(detalhe.payload, "ESPECIALIDADE_NOME")],
                  ["Encaminhamento", f(detalhe.payload, "ENCAMINHAMENTO_DESCRICAO")],
                  ["Serviço", f(detalhe.payload, "SERVICO_DESCRICAO")],
                  ["Destino", f(detalhe.payload, "DESTINO_NOME")],
                  ["Tipo de vaga", f(detalhe.payload, "TIPO_VAGA")],
                  ["Status", f(detalhe.payload, "STATUS_DESCRICAO")],
                  ["Operador", f(detalhe.payload, "USUARIO_NOME")],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border bg-card p-2">
                    <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
                    <div className="text-sm">{txt(value)}</div>
                  </div>
                ))}
              </div>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Todos os campos recebidos</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                  {JSON.stringify(detalhe.payload, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
