import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Thermometer, Heart, Wind, Droplets, AlertTriangle, Stethoscope, CheckCircle2 } from "lucide-react";
import { format, differenceInYears } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { SemAcesso } from "@/components/sem-acesso";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

function Guard() {
  const { can } = useAuth();
  if (!can("triagem")) return <SemAcesso />;
  return <TriagemPage />;
}

export const Route = createFileRoute("/app/triagem")({ component: Guard });

const RISCO_OPTIONS = [
  { value: "vermelho", label: "Vermelho - Emergência", className: "bg-red-600 text-white" },
  { value: "laranja", label: "Laranja - Muito urgente", className: "bg-orange-500 text-white" },
  { value: "amarelo", label: "Amarelo - Urgente", className: "bg-yellow-400 text-black" },
  { value: "verde", label: "Verde - Pouco urgente", className: "bg-emerald-500 text-white" },
  { value: "azul", label: "Azul - Não urgente", className: "bg-blue-500 text-white" },
];

function riscoBadge(r: string | null) {
  const opt = RISCO_OPTIONS.find((o) => o.value === r);
  if (!opt) return <Badge variant="outline">—</Badge>;
  return <Badge className={opt.className}>{opt.label.split(" - ")[0]}</Badge>;
}

function TriagemPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [today] = useState(format(new Date(), "yyyy-MM-dd"));
  const [unidadeId, setUnidadeId] = useState("all");
  const [open, setOpen] = useState<any>(null);

  const { data: unidades } = useAllowedUnidades();
  const allowedIds = useMemo(() => (unidades ?? []).map((u: any) => u.id), [unidades]);

  const { data: ags, isLoading } = useQuery({
    queryKey: ["triagem-fila", today, unidadeId, allowedIds.join(",")],
    enabled: !!unidades,
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select(
          "id, hora_inicio, status, classificacao_risco, chegou_em, triagem_em, triado_em, pacientes(id, nome, cpf, data_nascimento), unidades(nome), profissionais(nome, especialidades(nome))",
        )
        .eq("data", today)
        .in("status", ["chegou", "em_triagem", "triado"]);
      if (unidadeId !== "all") q = q.eq("unidade_id", unidadeId);
      else if (allowedIds.length > 0) q = q.in("unidade_id", allowedIds);
      return (await q).data ?? [];
    },
  });

  const fila = (ags ?? []).sort((a: any, b: any) => {
    const order = (s: string) => (s === "chegou" ? 0 : s === "em_triagem" ? 1 : 2);
    return order(a.status) - order(b.status) || (a.chegou_em ?? "").localeCompare(b.chegou_em ?? "");
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Triagem · Classificação de Risco</h1>
          <p className="text-sm text-muted-foreground">Protocolo de Manchester · {format(new Date(), "dd/MM/yyyy")}</p>
        </div>
        <Select value={unidadeId} onValueChange={setUnidadeId}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as unidades</SelectItem>
            {(unidades ?? []).map((u: any) => (
              <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Fila de triagem</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState />
          ) : fila.length === 0 ? (
            <EmptyState title="Ninguém aguardando triagem" description="Pacientes com check-in aparecem aqui." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fila.map((a: any) => {
                  const idade = a.pacientes?.data_nascimento
                    ? differenceInYears(new Date(), new Date(a.pacientes.data_nascimento))
                    : null;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.pacientes?.nome} {idade !== null && <span className="text-xs text-muted-foreground">· {idade}a</span>}
                      </TableCell>
                      <TableCell className="tabular-nums">{a.hora_inicio?.slice(0, 5)}</TableCell>
                      <TableCell className="text-muted-foreground">{a.profissionais?.nome}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === "triado" ? "outline" : "secondary"}>
                          {a.status === "chegou" ? "Aguardando" : a.status === "em_triagem" ? "Em triagem" : "Triado"}
                        </Badge>
                      </TableCell>
                      <TableCell>{riscoBadge(a.classificacao_risco)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={async () => {
                          if (a.status === "chegou") {
                            await supabase.from("agendamentos").update({ status: "em_triagem", triagem_por: user?.id }).eq("id", a.id);
                            qc.invalidateQueries({ queryKey: ["triagem-fila"] });
                          }
                          setOpen(a);
                        }}>
                          <Stethoscope className="mr-1 h-4 w-4" /> {a.status === "triado" ? "Ver/editar" : "Triar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {open && <TriagemDialog agendamento={open} onClose={() => { setOpen(null); qc.invalidateQueries({ queryKey: ["triagem-fila"] }); }} />}
    </div>
  );
}

function TriagemDialog({ agendamento, onClose }: { agendamento: any; onClose: () => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [classificacao, setClassificacao] = useState<string>(agendamento.classificacao_risco ?? "");
  const [queixa, setQueixa] = useState("");
  const [pasis, setPasis] = useState("");
  const [padia, setPadia] = useState("");
  const [fc, setFc] = useState("");
  const [fr, setFr] = useState("");
  const [temp, setTemp] = useState("");
  const [sato2, setSato2] = useState("");
  const [glic, setGlic] = useState("");
  const [dor, setDor] = useState("");
  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [obs, setObs] = useState("");

  // carrega triagem existente, se houver
  useQuery({
    queryKey: ["triagem-existente", agendamento.id],
    queryFn: async () => {
      const { data } = await supabase.from("triagens").select("*").eq("agendamento_id", agendamento.id).maybeSingle();
      if (data) {
        setClassificacao(data.classificacao_risco ?? "");
        setQueixa(data.queixa_principal ?? "");
        setPasis(data.pa_sistolica?.toString() ?? "");
        setPadia(data.pa_diastolica?.toString() ?? "");
        setFc(data.fc?.toString() ?? "");
        setFr(data.fr?.toString() ?? "");
        setTemp(data.temperatura?.toString() ?? "");
        setSato2(data.sato2?.toString() ?? "");
        setGlic(data.glicemia?.toString() ?? "");
        setDor(data.dor?.toString() ?? "");
        setPeso(data.peso?.toString() ?? "");
        setAltura(data.altura?.toString() ?? "");
        setObs(data.observacoes ?? "");
      }
      return data;
    },
  });

  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const int = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));

  const salvar = async () => {
    if (!classificacao) { toast.error("Selecione a classificação de risco."); return; }
    setSaving(true);
    const payload: any = {
      agendamento_id: agendamento.id,
      paciente_id: agendamento.pacientes?.id ?? agendamento.paciente_id,
      unidade_id: agendamento.unidade_id ?? null,
      triado_por: user?.id,
      triado_em: new Date().toISOString(),
      classificacao_risco: classificacao,
      queixa_principal: queixa || null,
      pa_sistolica: int(pasis),
      pa_diastolica: int(padia),
      fc: int(fc),
      fr: int(fr),
      temperatura: num(temp),
      sato2: int(sato2),
      glicemia: int(glic),
      dor: int(dor),
      peso: num(peso),
      altura: num(altura),
      observacoes: obs || null,
    };
    const { error: e1 } = await supabase.from("triagens").upsert(payload, { onConflict: "agendamento_id" });
    if (e1) { toast.error("Erro ao salvar triagem: " + e1.message); setSaving(false); return; }
    const { error: e2 } = await supabase.from("agendamentos")
      .update({ status: "triado", classificacao_risco: classificacao, triado_em: new Date().toISOString() })
      .eq("id", agendamento.id);
    if (e2) { toast.error(e2.message); setSaving(false); return; }
    toast.success("Triagem registrada");
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agendamento.pacientes?.nome}</DialogTitle>
          <p className="text-xs text-muted-foreground">{agendamento.profissionais?.nome} · {agendamento.hora_inicio?.slice(0,5)}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Classificação de risco (Manchester)</Label>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
              {RISCO_OPTIONS.map((o) => (
                <button key={o.value} type="button"
                  onClick={() => setClassificacao(o.value)}
                  className={`rounded-md px-2 py-3 text-xs font-semibold ring-offset-2 transition ${o.className} ${classificacao === o.value ? "ring-2 ring-foreground" : "opacity-70 hover:opacity-100"}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="queixa">Queixa principal</Label>
            <Textarea id="queixa" value={queixa} onChange={(e) => setQueixa(e.target.value)} rows={2} />
          </div>

          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1"><Activity className="h-4 w-4" /> Sinais vitais</h3>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field icon={<Heart className="h-3 w-3" />} label="PA sistólica" value={pasis} onChange={setPasis} suffix="mmHg" />
              <Field icon={<Heart className="h-3 w-3" />} label="PA diastólica" value={padia} onChange={setPadia} suffix="mmHg" />
              <Field icon={<Heart className="h-3 w-3" />} label="FC" value={fc} onChange={setFc} suffix="bpm" />
              <Field icon={<Wind className="h-3 w-3" />} label="FR" value={fr} onChange={setFr} suffix="irpm" />
              <Field icon={<Thermometer className="h-3 w-3" />} label="Temp." value={temp} onChange={setTemp} suffix="°C" />
              <Field icon={<Activity className="h-3 w-3" />} label="SatO₂" value={sato2} onChange={setSato2} suffix="%" />
              <Field icon={<Droplets className="h-3 w-3" />} label="Glicemia (HGT)" value={glic} onChange={setGlic} suffix="mg/dL" />
              <Field icon={<AlertTriangle className="h-3 w-3" />} label="Dor (0-10)" value={dor} onChange={setDor} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Antropometria</h3>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Peso" value={peso} onChange={setPeso} suffix="kg" />
              <Field label="Altura" value={altura} onChange={setAltura} suffix="m" />
            </div>
          </div>

          <div>
            <Label htmlFor="obs">Observações</Label>
            <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> {saving ? "Salvando..." : "Concluir triagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, suffix, icon }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; icon?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">{icon}{label}</Label>
      <div className="relative">
        <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="pr-10" />
        {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
