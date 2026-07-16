import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";

function CotasGuard() {
  const { can, isAdmin } = useAuth();
  if (!(isAdmin || can("cotas", "manage"))) return <SemAcesso />;
  return <CotasPage />;
}
export const Route = createFileRoute("/app/configuracoes/cotas")({ component: CotasGuard });

function firstOfMonth(d: Date) {
  const s = format(d, "yyyy-MM");
  return `${s}-01`;
}

export function CotasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cotas de agendamento</h1>
        <p className="text-sm text-muted-foreground">
          Defina para cada UBS se o agendamento é livre ou por cota mensal, e configure limites por especialidade e procedimento.
          A Secretaria de Saúde tem cota extra fixa para urgências.
        </p>
      </div>

      <Tabs defaultValue="regimes">
        <TabsList>
          <TabsTrigger value="regimes">Regime por UBS</TabsTrigger>
          <TabsTrigger value="cotas">Cotas mensais</TabsTrigger>
        </TabsList>
        <TabsContent value="regimes" className="pt-4"><RegimesCard /></TabsContent>
        <TabsContent value="cotas" className="pt-4"><CotasMensaisCard /></TabsContent>
      </Tabs>
    </div>
  );
}

function RegimesCard() {
  const qc = useQueryClient();
  const { data: unidades } = useQuery({
    queryKey: ["unidades-regime"],
    queryFn: async () =>
      (await supabase.from("unidades").select("id, nome, cnes, ativo, regime_agendamento" as any).order("nome")).data ?? [],
  });

  const toggle = async (u: any, cota: boolean) => {
    const regime = cota ? "cota" : "livre";
    const { error } = await supabase.from("unidades").update({ regime_agendamento: regime } as any).eq("id", u.id);
    if (error) return toast.error(error.message);
    toast.success(`UBS ${u.nome}: ${regime === "cota" ? "por cota" : "livre"}`);
    qc.invalidateQueries({ queryKey: ["unidades-regime"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regime por unidade</CardTitle>
        <CardDescription>Ligue "Por cota" para aplicar limites mensais aos agendamentos dessa UBS.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unidade</TableHead>
              <TableHead>CNES</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Regime</TableHead>
              <TableHead className="text-right">Por cota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!unidades || unidades.length === 0) && (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">Cadastre unidades primeiro.</TableCell></TableRow>
            )}
            {unidades?.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell className="font-mono text-xs">{u.cnes ?? "—"}</TableCell>
                <TableCell>
                  {u.ativo ? <Badge className="bg-success/15 text-success border-0">Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}
                </TableCell>
                <TableCell>
                  {u.regime_agendamento === "cota" ? (
                    <Badge className="bg-warning/15 text-warning border-0">Por cota</Badge>
                  ) : (
                    <Badge variant="outline">Livre</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Switch checked={u.regime_agendamento === "cota"} onCheckedChange={(v) => toggle(u, v)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CotasMensaisCard() {
  const { data: unidades } = useQuery({
    queryKey: ["unidades-ativas-cotas"],
    queryFn: async () => (await supabase.from("unidades").select("id, nome").eq("ativo", true).order("nome")).data ?? [],
  });
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [competencia, setCompetencia] = useState<string>(firstOfMonth(new Date()));

  useMemo(() => {
    if (!unidadeId && unidades && unidades.length > 0) setUnidadeId(unidades[0].id);
  }, [unidades, unidadeId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Escolha a UBS e a competência (mês) para editar as cotas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {(unidades ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Competência (mês)</Label>
            <Input type="month" value={competencia.slice(0, 7)} onChange={(e) => setCompetencia(`${e.target.value}-01`)} />
          </div>
        </CardContent>
      </Card>

      {unidadeId && (
        <>
          <CotasEspecialidadeTable unidadeId={unidadeId} competencia={competencia} />
          <CotasProcedimentoTable unidadeId={unidadeId} competencia={competencia} />
        </>
      )}
    </div>
  );
}

type LinhaEsp = { especialidade_id: string; nome: string; vagas_totais: number; vagas_secretaria: number; id?: string };

function CotasEspecialidadeTable({ unidadeId, competencia }: { unidadeId: string; competencia: string }) {
  const qc = useQueryClient();
  const { data: especialidades } = useQuery({
    queryKey: ["especialidades-todas"],
    queryFn: async () => (await supabase.from("especialidades").select("id, nome").order("nome")).data ?? [],
  });
  const { data: cotas, isFetching } = useQuery({
    queryKey: ["cotas-esp", unidadeId, competencia],
    enabled: !!unidadeId && !!competencia,
    queryFn: async () =>
      (await supabase
        .from("cotas_especialidade")
        .select("id, especialidade_id, vagas_totais, vagas_secretaria" as any)
        .eq("unidade_id", unidadeId)
        .eq("competencia", competencia)).data ?? [],
  });

  const [rows, setRows] = useState<LinhaEsp[]>([]);
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (!especialidades) return;
    const map = new Map<string, any>((cotas ?? []).map((c: any) => [c.especialidade_id, c]));
    setRows(
      especialidades.map((e: any) => {
        const c = map.get(e.id);
        return {
          especialidade_id: e.id,
          nome: e.nome,
          vagas_totais: c?.vagas_totais ?? 0,
          vagas_secretaria: c?.vagas_secretaria ?? 0,
          id: c?.id,
        };
      })
    );
  }, [especialidades, cotas]);

  const update = (idx: number, key: "vagas_totais" | "vagas_secretaria", value: number) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  const salvar = async () => {
    setSaving(true);
    const payload = rows
      .filter((r) => r.vagas_totais > 0 || r.vagas_secretaria > 0 || r.id)
      .map((r) => ({
        unidade_id: unidadeId,
        especialidade_id: r.especialidade_id,
        competencia,
        vagas_totais: Math.max(0, r.vagas_totais | 0),
        vagas_secretaria: Math.max(0, r.vagas_secretaria | 0),
      }));
    const { error } = await supabase.from("cotas_especialidade").upsert(payload as any, {
      onConflict: "unidade_id,especialidade_id,competencia",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cotas por especialidade salvas");
    qc.invalidateQueries({ queryKey: ["cotas-esp", unidadeId, competencia] });
  };

  const copiarMesAnterior = async () => {
    const anterior = firstOfMonth(subMonths(new Date(competencia), 1));
    const { data } = await supabase
      .from("cotas_especialidade")
      .select("especialidade_id, vagas_totais, vagas_secretaria" as any)
      .eq("unidade_id", unidadeId)
      .eq("competencia", anterior);
    if (!data || data.length === 0) return toast.info("Nada configurado no mês anterior");
    const map = new Map<string, any>(data.map((d: any) => [d.especialidade_id, d]));
    setRows((prev) =>
      prev.map((r) => {
        const src = map.get(r.especialidade_id);
        return src ? { ...r, vagas_totais: src.vagas_totais, vagas_secretaria: src.vagas_secretaria } : r;
      })
    );
    toast.success(`Copiado de ${anterior.slice(0, 7)}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Especialidades</CardTitle>
          <CardDescription>Vagas totais + vagas extras da Secretaria (urgências).</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copiarMesAnterior}>
            <Copy className="mr-1 h-4 w-4" /> Copiar mês anterior
          </Button>
          <Button size="sm" onClick={salvar} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isFetching ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Especialidade</TableHead>
                <TableHead className="w-40">Vagas UBS</TableHead>
                <TableHead className="w-40">Vagas Secretaria</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">Cadastre especialidades primeiro.</TableCell></TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={r.especialidade_id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell>
                    <Input type="number" min={0} value={r.vagas_totais} onChange={(e) => update(i, "vagas_totais", Number(e.target.value))} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} value={r.vagas_secretaria} onChange={(e) => update(i, "vagas_secretaria", Number(e.target.value))} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

type LinhaProc = { procedimento_id: string; codigo: string; nome: string; vagas_totais: number; vagas_secretaria: number; id?: string };

function CotasProcedimentoTable({ unidadeId, competencia }: { unidadeId: string; competencia: string }) {
  const qc = useQueryClient();
  const { data: procedimentos } = useQuery({
    queryKey: ["procedimentos-todos-cotas"],
    queryFn: async () => (await supabase.from("procedimentos").select("id, codigo_sigtap, nome").eq("ativo", true).order("codigo_sigtap")).data ?? [],
  });
  const { data: cotas, isFetching } = useQuery({
    queryKey: ["cotas-proc", unidadeId, competencia],
    enabled: !!unidadeId && !!competencia,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("cotas_procedimento")
        .select("id, procedimento_id, vagas_totais, vagas_secretaria")
        .eq("unidade_id", unidadeId)
        .eq("competencia", competencia);
      if (error) return [];
      return data ?? [];
    },
  });

  const [rows, setRows] = useState<LinhaProc[]>([]);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState("");

  useMemo(() => {
    if (!procedimentos) return;
    const map = new Map<string, any>((cotas ?? []).map((c: any) => [c.procedimento_id, c]));
    setRows(
      procedimentos.map((p: any) => {
        const c = map.get(p.id);
        return {
          procedimento_id: p.id,
          codigo: p.codigo_sigtap,
          nome: p.nome,
          vagas_totais: c?.vagas_totais ?? 0,
          vagas_secretaria: c?.vagas_secretaria ?? 0,
          id: c?.id,
        };
      })
    );
  }, [procedimentos, cotas]);

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.codigo.includes(q) || r.nome.toLowerCase().includes(q));
  }, [rows, filtro]);

  const update = (id: string, key: "vagas_totais" | "vagas_secretaria", value: number) => {
    setRows((prev) => prev.map((r) => (r.procedimento_id === id ? { ...r, [key]: value } : r)));
  };

  const salvar = async () => {
    setSaving(true);
    const payload = rows
      .filter((r) => r.vagas_totais > 0 || r.vagas_secretaria > 0 || r.id)
      .map((r) => ({
        unidade_id: unidadeId,
        procedimento_id: r.procedimento_id,
        competencia,
        vagas_totais: Math.max(0, r.vagas_totais | 0),
        vagas_secretaria: Math.max(0, r.vagas_secretaria | 0),
      }));
    const { error } = await (supabase.from as any)("cotas_procedimento").upsert(payload, {
      onConflict: "unidade_id,procedimento_id,competencia",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cotas por procedimento salvas");
    qc.invalidateQueries({ queryKey: ["cotas-proc", unidadeId, competencia] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Procedimentos (SIGTAP)</CardTitle>
          <CardDescription>Configuração opcional. Se um procedimento não tem cota, ele não é limitado.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Buscar por código ou nome" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="w-64" />
          <Button size="sm" onClick={salvar} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isFetching ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-32">UBS</TableHead>
                  <TableHead className="w-32">Secretaria</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">Nenhum procedimento.</TableCell></TableRow>
                )}
                {filtradas.map((r) => (
                  <TableRow key={r.procedimento_id}>
                    <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                    <TableCell className="text-sm">{r.nome}</TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={r.vagas_totais} onChange={(e) => update(r.procedimento_id, "vagas_totais", Number(e.target.value))} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={r.vagas_secretaria} onChange={(e) => update(r.procedimento_id, "vagas_secretaria", Number(e.target.value))} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
