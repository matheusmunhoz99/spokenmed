"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  FileSignature,
  FileText,
  FlaskConical,
  HeartPulse,
  Pill,
  Plus,
  Send,
  Stethoscope,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CID10 } from "@/lib/mock/cid10";
import { MEDICAMENTOS } from "@/lib/mock/medicamentos";
import { EXAMES_SADT } from "@/lib/mock/exames-sadt";
import { EnvioEsusOverlay } from "./envio-esus-overlay";
import { formatTime } from "@/lib/format";

interface Agendamento {
  id: string;
  hora_inicio?: string;
  pacientes?: { nome?: string; cpf?: string; telefone?: string };
  profissionais?: { nome?: string; especialidades?: { nome?: string } };
  unidades?: { nome?: string };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamento: Agendamento | null;
  onFinalizado: (id: string, protocolo: string) => void;
}

interface MedItem {
  id: string;
  nome: string;
  posologia: string;
  qtd: string;
  duracao: string;
}

interface AlergiaItem {
  id: string;
  substancia: string;
  reacao: string;
  gravidade: "leve" | "moderada" | "grave";
}

export function ConsultorioDialog({ open, onOpenChange, agendamento, onFinalizado }: Props) {
  const [tab, setTab] = useState("soap");
  const [enviando, setEnviando] = useState(false);

  // SOAP
  const [s, setS] = useState("");
  const [o, setO] = useState("");
  const [a, setA] = useState("");
  const [p, setP] = useState("");
  // sinais vitais
  const [pa, setPa] = useState("");
  const [fc, setFc] = useState("");
  const [temp, setTemp] = useState("");
  const [sat, setSat] = useState("");
  const [peso, setPeso] = useState("");

  // CID
  const [cids, setCids] = useState<string[]>([]);
  const [cidBusca, setCidBusca] = useState("");

  // Alergias
  const [alergias, setAlergias] = useState<AlergiaItem[]>([]);
  const [aSub, setASub] = useState("");
  const [aReac, setAReac] = useState("");
  const [aGrav, setAGrav] = useState<AlergiaItem["gravidade"]>("moderada");

  // Atestado
  const [atDias, setAtDias] = useState("2");
  const [atCid, setAtCid] = useState("");
  const [atRepouso, setAtRepouso] = useState(true);

  // Receita
  const [meds, setMeds] = useState<MedItem[]>([]);
  const [medNome, setMedNome] = useState("");
  const [medPos, setMedPos] = useState("");
  const [medQtd, setMedQtd] = useState("");
  const [medDur, setMedDur] = useState("");

  // Guia SISREG
  const [gEsp, setGEsp] = useState("");
  const [gPrior, setGPrior] = useState("eletivo");
  const [gHip, setGHip] = useState("");
  const [gJust, setGJust] = useState("");

  // SADT
  const [sadt, setSadt] = useState<string[]>([]);

  // LME
  const [lmeMed, setLmeMed] = useState("");
  const [lmeCid, setLmeCid] = useState("");
  const [lmePos, setLmePos] = useState("");
  const [lmeTempo, setLmeTempo] = useState("");
  const [lmeAnam, setLmeAnam] = useState("");

  const paciente = agendamento?.pacientes?.nome ?? "Paciente";
  const cpf = agendamento?.pacientes?.cpf ?? "";

  const cidFiltrado = useMemo(() => {
    const q = cidBusca.trim().toLowerCase();
    if (!q) return CID10.slice(0, 12);
    return CID10.filter(
      (c) => c.code.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q),
    ).slice(0, 20);
  }, [cidBusca]);

  const toggleCid = (code: string) =>
    setCids((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));

  const toggleSadt = (item: string) =>
    setSadt((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));

  const addAlergia = () => {
    if (!aSub.trim()) return;
    setAlergias((prev) => [
      ...prev,
      { id: crypto.randomUUID(), substancia: aSub.trim(), reacao: aReac.trim(), gravidade: aGrav },
    ]);
    setASub("");
    setAReac("");
  };

  const addMed = () => {
    if (!medNome.trim()) return;
    setMeds((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nome: medNome.trim(),
        posologia: medPos.trim(),
        qtd: medQtd.trim(),
        duracao: medDur.trim(),
      },
    ]);
    setMedNome("");
    setMedPos("");
    setMedQtd("");
    setMedDur("");
  };

  const reset = () => {
    setS(""); setO(""); setA(""); setP("");
    setPa(""); setFc(""); setTemp(""); setSat(""); setPeso("");
    setCids([]); setCidBusca("");
    setAlergias([]); setASub(""); setAReac(""); setAGrav("moderada");
    setAtDias("2"); setAtCid(""); setAtRepouso(true);
    setMeds([]); setMedNome(""); setMedPos(""); setMedQtd(""); setMedDur("");
    setGEsp(""); setGPrior("eletivo"); setGHip(""); setGJust("");
    setSadt([]);
    setLmeMed(""); setLmeCid(""); setLmePos(""); setLmeTempo(""); setLmeAnam("");
    setTab("soap");
  };

  const finalizar = () => setEnviando(true);

  const handleEnvioFechar = () => {
    setEnviando(false);
    if (agendamento) onFinalizado(agendamento.id, `PEC-${Date.now().toString().slice(-10)}`);
    reset();
    onOpenChange(false);
  };

  if (!open || !agendamento) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex flex-col bg-background animate-in fade-in duration-200">
        {/* Header */}
        <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                  {paciente}
                </h1>
                <Badge variant="secondary" className="text-[10px]">
                  Atendimento individual
                </Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {cpf && <span>CPF {cpf}</span>}
                {agendamento.hora_inicio && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    {formatTime(agendamento.hora_inicio)}
                  </span>
                )}
                {agendamento.profissionais?.nome && <span>{agendamento.profissionais.nome}</span>}
                {agendamento.unidades?.nome && (
                  <span className="text-primary/80">{agendamento.unidades.nome}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={finalizar} className="gap-2">
                <Send className="h-4 w-4" />
                Finalizar e enviar ao eSUS PEC
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (s || o || a || p || meds.length || cids.length) {
                    if (!confirm("Descartar atendimento e fechar?")) return;
                  }
                  reset();
                  onOpenChange(false);
                }}
                aria-label="Fechar consultório"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[300px_1fr]">
          {/* Sidebar resumo */}
          <aside className="space-y-3">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <User className="h-3.5 w-3.5" /> Resumo do paciente
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">CNS</dt>
                  <dd className="font-mono text-xs">700 0000 0000 0000</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Sexo</dt>
                  <dd>Não informado</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Idade</dt>
                  <dd>—</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/20">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Alergias ativas
              </div>
              {alergias.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma alergia registrada.</p>
              ) : (
                <ul className="space-y-1">
                  {alergias.map((al) => (
                    <li key={al.id} className="text-xs">
                      <strong>{al.substancia}</strong>
                      {al.reacao && <> — {al.reacao}</>}
                      <Badge
                        variant="outline"
                        className={`ml-1 text-[9px] ${
                          al.gravidade === "grave"
                            ? "border-rose-400 text-rose-700"
                            : al.gravidade === "moderada"
                              ? "border-amber-400 text-amber-700"
                              : "border-slate-300 text-slate-600"
                        }`}
                      >
                        {al.gravidade}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Activity className="h-3.5 w-3.5" /> Sinais vitais
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="PA (mmHg)" v={pa} onChange={setPa} placeholder="120x80" />
                <Field label="FC (bpm)" v={fc} onChange={setFc} placeholder="78" />
                <Field label="Temp (°C)" v={temp} onChange={setTemp} placeholder="36,5" />
                <Field label="SatO₂ (%)" v={sat} onChange={setSat} placeholder="98" />
                <Field label="Peso (kg)" v={peso} onChange={setPeso} placeholder="70" />
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5" /> Últimos atendimentos
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>— Sem histórico anterior nesta UBS —</li>
              </ul>
            </div>
          </aside>

          {/* Main tabs */}
          <main className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40 p-1">
                <TabsTrigger value="soap" className="gap-1.5"><HeartPulse className="h-3.5 w-3.5" />SOAP</TabsTrigger>
                <TabsTrigger value="cid" className="gap-1.5"><FileText className="h-3.5 w-3.5" />CID</TabsTrigger>
                <TabsTrigger value="alergias" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Alergias</TabsTrigger>
                <TabsTrigger value="atestado" className="gap-1.5"><FileSignature className="h-3.5 w-3.5" />Atestado</TabsTrigger>
                <TabsTrigger value="receita" className="gap-1.5"><Pill className="h-3.5 w-3.5" />Receita</TabsTrigger>
                <TabsTrigger value="guia" className="gap-1.5"><Send className="h-3.5 w-3.5" />Guia</TabsTrigger>
                <TabsTrigger value="sadt" className="gap-1.5"><FlaskConical className="h-3.5 w-3.5" />SADT</TabsTrigger>
                <TabsTrigger value="lme" className="gap-1.5"><FileText className="h-3.5 w-3.5" />LME</TabsTrigger>
              </TabsList>

              {/* SOAP */}
              <TabsContent value="soap" className="mt-4 space-y-3">
                <SoapBox label="S — Subjetivo" hint="Queixa, história, contexto." v={s} onChange={setS} />
                <SoapBox label="O — Objetivo" hint="Exame físico, sinais." v={o} onChange={setO} />
                <SoapBox label="A — Avaliação" hint="Hipóteses, problemas." v={a} onChange={setA} />
                <SoapBox label="P — Plano" hint="Conduta, orientações, retorno." v={p} onChange={setP} />
              </TabsContent>

              {/* CID */}
              <TabsContent value="cid" className="mt-4 space-y-3">
                <div>
                  <Label className="text-xs">Buscar CID-10</Label>
                  <Input
                    value={cidBusca}
                    onChange={(e) => setCidBusca(e.target.value)}
                    placeholder="Ex.: I10, hipertensão, J00…"
                  />
                </div>
                {cids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cids.map((c) => {
                      const item = CID10.find((x) => x.code === c);
                      return (
                        <Badge key={c} variant="default" className="cursor-pointer gap-1" onClick={() => toggleCid(c)}>
                          {c} {item?.desc && <span className="font-normal opacity-80">· {item.desc.slice(0, 28)}</span>}
                          <X className="h-3 w-3" />
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <ul className="max-h-80 overflow-y-auto rounded-lg border divide-y">
                  {cidFiltrado.map((c) => (
                    <li
                      key={c.code}
                      onClick={() => toggleCid(c.code)}
                      className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-accent ${cids.includes(c.code) ? "bg-primary/5" : ""}`}
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-semibold">{c.code}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.desc}</div>
                      </div>
                      <Checkbox checked={cids.includes(c.code)} />
                    </li>
                  ))}
                </ul>
              </TabsContent>

              {/* Alergias */}
              <TabsContent value="alergias" className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
                  <Input placeholder="Substância (ex.: Dipirona)" value={aSub} onChange={(e) => setASub(e.target.value)} />
                  <Input placeholder="Reação (ex.: urticária)" value={aReac} onChange={(e) => setAReac(e.target.value)} />
                  <Select value={aGrav} onValueChange={(v) => setAGrav(v as AlergiaItem["gravidade"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leve">Leve</SelectItem>
                      <SelectItem value="moderada">Moderada</SelectItem>
                      <SelectItem value="grave">Grave</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={addAlergia}><Plus className="h-4 w-4" />Adicionar</Button>
                </div>
                {alergias.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma alergia registrada.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {alergias.map((al) => (
                      <li key={al.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <strong>{al.substancia}</strong>
                          {al.reacao && <span className="text-muted-foreground"> — {al.reacao}</span>}
                          <Badge variant="outline" className="ml-2 text-[10px]">{al.gravidade}</Badge>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => setAlergias((prev) => prev.filter((x) => x.id !== al.id))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              {/* Atestado */}
              <TabsContent value="atestado" className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Dias de afastamento</Label>
                    <Input type="number" min={1} max={90} value={atDias} onChange={(e) => setAtDias(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">CID (opcional)</Label>
                    <Input placeholder="Ex.: J06.9" value={atCid} onChange={(e) => setAtCid(e.target.value)} />
                  </div>
                  <label className="flex items-end gap-2 pb-2">
                    <Checkbox checked={atRepouso} onCheckedChange={(v) => setAtRepouso(!!v)} />
                    <span className="text-sm">Repouso domiciliar</span>
                  </label>
                </div>
                <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-relaxed">
                  <p className="text-center font-semibold uppercase tracking-wide">Atestado médico</p>
                  <p className="mt-3">
                    Atesto, para os devidos fins, que o(a) Sr(a). <strong>{paciente}</strong>
                    {cpf && <> (CPF {cpf})</>} esteve sob meus cuidados profissionais nesta data,
                    necessitando de afastamento de suas atividades habituais pelo período de{" "}
                    <strong>{atDias || "—"}</strong> dia(s){atRepouso && ", em repouso domiciliar"}
                    {atCid && <> (CID {atCid})</>}.
                  </p>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Documento será assinado digitalmente (ICP-Brasil) ao finalizar o atendimento.
                  </p>
                </div>
              </TabsContent>

              {/* Receita */}
              <TabsContent value="receita" className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-[2fr_1.2fr_0.7fr_0.7fr_auto]">
                  <div>
                    <Input
                      list="meds-list"
                      placeholder="Medicamento"
                      value={medNome}
                      onChange={(e) => setMedNome(e.target.value)}
                    />
                    <datalist id="meds-list">
                      {MEDICAMENTOS.map((m) => <option key={m} value={m} />)}
                    </datalist>
                  </div>
                  <Input placeholder="Posologia (1 cp 8/8h)" value={medPos} onChange={(e) => setMedPos(e.target.value)} />
                  <Input placeholder="Qtd" value={medQtd} onChange={(e) => setMedQtd(e.target.value)} />
                  <Input placeholder="Duração" value={medDur} onChange={(e) => setMedDur(e.target.value)} />
                  <Button onClick={addMed}><Plus className="h-4 w-4" /></Button>
                </div>
                {meds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum medicamento adicionado.</p>
                ) : (
                  <ol className="divide-y rounded-lg border">
                    {meds.map((m, idx) => (
                      <li key={m.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                        <span className="mt-0.5 font-mono text-xs text-muted-foreground">{idx + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{m.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {[m.posologia, m.qtd && `Qtd: ${m.qtd}`, m.duracao && `por ${m.duracao}`].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => setMeds((prev) => prev.filter((x) => x.id !== m.id))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}
              </TabsContent>

              {/* Guia */}
              <TabsContent value="guia" className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Especialidade</Label>
                    <Input placeholder="Ex.: Cardiologia" value={gEsp} onChange={(e) => setGEsp(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade</Label>
                    <Select value={gPrior} onValueChange={setGPrior}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eletivo">Eletivo</SelectItem>
                        <SelectItem value="prioritario">Prioritário</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Hipótese diagnóstica</Label>
                  <Input value={gHip} onChange={(e) => setGHip(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Justificativa clínica</Label>
                  <Textarea rows={4} value={gJust} onChange={(e) => setGJust(e.target.value)} />
                </div>
              </TabsContent>

              {/* SADT */}
              <TabsContent value="sadt" className="mt-4 space-y-4">
                {EXAMES_SADT.map((g) => (
                  <div key={g.grupo}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.grupo}</div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {g.itens.map((it) => (
                        <label key={it} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                          <Checkbox checked={sadt.includes(it)} onCheckedChange={() => toggleSadt(it)} />
                          <span>{it}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {sadt.length > 0 && (
                  <div className="rounded-lg border bg-muted/20 p-3 text-xs">
                    <strong>{sadt.length}</strong> exame(s) selecionado(s).
                  </div>
                )}
              </TabsContent>

              {/* LME */}
              <TabsContent value="lme" className="mt-4 space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                  Laudo para Solicitação de Medicamento de Alto Custo (LME) — Componente Especializado.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Medicamento solicitado</Label>
                    <Input value={lmeMed} onChange={(e) => setLmeMed(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">CID-10 (obrigatório)</Label>
                    <Input placeholder="Ex.: M05" value={lmeCid} onChange={(e) => setLmeCid(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Posologia</Label>
                    <Input value={lmePos} onChange={(e) => setLmePos(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Tempo de tratamento</Label>
                    <Input placeholder="Ex.: 6 meses" value={lmeTempo} onChange={(e) => setLmeTempo(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Anamnese / justificativa clínica</Label>
                  <Textarea rows={5} value={lmeAnam} onChange={(e) => setLmeAnam(e.target.value)} />
                </div>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>

      <EnvioEsusOverlay open={enviando} onClose={handleEnvioFechar} pacienteNome={paciente} />
    </>
  );
}

function Field({
  label, v, onChange, placeholder,
}: { label: string; v: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
    </div>
  );
}

function SoapBox({
  label, hint, v, onChange,
}: { label: string; hint: string; v: string; onChange: (s: string) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        <span className="text-[10px] text-muted-foreground">{hint} · {v.length} caracteres</span>
      </div>
      <Textarea rows={4} value={v} onChange={(e) => onChange(e.target.value)} className="resize-y" />
    </div>
  );
}
