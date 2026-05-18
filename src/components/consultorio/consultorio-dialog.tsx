"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CalendarClock, ClipboardList, FileSignature, FileText, FlaskConical,
  HeartPulse, Pill, Plus, Printer, Save, Send, Stethoscope, Trash2, User, X, Timer, BadgeCheck, Workflow,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CID10 } from "@/lib/mock/cid10";
import { MEDICAMENTOS_BASE } from "@/lib/mock/medicamentos";
import { EXAMES_SADT } from "@/lib/mock/exames-sadt";
import { EnvioEsusOverlay } from "./envio-esus-overlay";
import { TabAtendimento, ATENDIMENTO_DEFAULT, type AtendimentoFlags } from "./tab-atendimento";
import { TabConduta, CONDUTA_DEFAULT, type CondutaFlags } from "./tab-conduta";
import { formatTime } from "@/lib/format";
import { gerarReceitaPdf, type ReceitaTipo } from "@/lib/pdf-receita";
import { gerarSadtPdf } from "@/lib/pdf-sadt";
import { gerarLmePdf } from "@/lib/pdf-lme";
import { gerarAtestadoPdf } from "@/lib/pdf-atestado";
import { useAuth } from "@/hooks/use-auth";
import { saveHistorico } from "@/lib/historico-atendimentos";
import logoUrl from "@/assets/spokenmed-logo.png";



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

interface MedItem { id: string; nome: string; apresentacao?: string; posologia: string; qtd: string; duracao: string; }
interface AlergiaItem { id: string; substancia: string; reacao: string; gravidade: "leve" | "moderada" | "grave"; }

const CNS_FAKE = "898 0014 5510 0023";
const CNES_FAKE = "2785143";
const INE_FAKE = "0001234567";
const CBO_FAKE = "225125";

export function ConsultorioDialog({ open, onOpenChange, agendamento, onFinalizado }: Props) {
  const { profile, user } = useAuth();
  const [tab, setTab] = useState("atendimento");
  const [enviando, setEnviando] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [restored, setRestored] = useState(false);
  // Flags eSUS
  const [atend, setAtend] = useState<AtendimentoFlags>(ATENDIMENTO_DEFAULT);
  const [conduta, setConduta] = useState<CondutaFlags>(CONDUTA_DEFAULT);

  // SOAP + vitais
  const [s, setS] = useState(""); const [o, setO] = useState(""); const [a, setA] = useState(""); const [p, setP] = useState("");
  const [pa, setPa] = useState(""); const [fc, setFc] = useState(""); const [fr, setFr] = useState(""); const [temp, setTemp] = useState(""); const [sat, setSat] = useState(""); const [peso, setPeso] = useState(""); const [altura, setAltura] = useState("");


  // CID
  const [cids, setCids] = useState<string[]>([]);
  const [cidBusca, setCidBusca] = useState("");

  // Alergias
  const [alergias, setAlergias] = useState<AlergiaItem[]>([]);
  const [aSub, setASub] = useState(""); const [aReac, setAReac] = useState(""); const [aGrav, setAGrav] = useState<AlergiaItem["gravidade"]>("moderada");

  // Atestado
  const [atDias, setAtDias] = useState("2"); const [atCid, setAtCid] = useState(""); const [atRepouso, setAtRepouso] = useState(true); const [atMencCid, setAtMencCid] = useState(false);

  // Receita
  const [recTipo, setRecTipo] = useState<ReceitaTipo>("comum");
  const [recOri, setRecOri] = useState("");
  const [meds, setMeds] = useState<MedItem[]>([]);
  const [medNome, setMedNome] = useState(""); const [medApres, setMedApres] = useState(""); const [medPos, setMedPos] = useState(""); const [medQtd, setMedQtd] = useState(""); const [medDur, setMedDur] = useState("");

  // Guia
  const [gEsp, setGEsp] = useState(""); const [gPrior, setGPrior] = useState<"eletivo"|"prioritario"|"urgente">("eletivo"); const [gHip, setGHip] = useState(""); const [gJust, setGJust] = useState("");

  // SADT
  const [sadt, setSadt] = useState<string[]>([]);
  const [sadtCarater, setSadtCarater] = useState<"eletivo"|"prioritario"|"urgente">("eletivo");
  const [sadtIndic, setSadtIndic] = useState("");

  // LME
  const [lmeMed, setLmeMed] = useState(""); const [lmeApres, setLmeApres] = useState(""); const [lmeCid, setLmeCid] = useState(""); const [lmePos, setLmePos] = useState(""); const [lmeQtd, setLmeQtd] = useState(""); const [lmeTempo, setLmeTempo] = useState(""); const [lmeAnam, setLmeAnam] = useState(""); const [lmeExames, setLmeExames] = useState("");

  const paciente = agendamento?.pacientes?.nome ?? "Paciente";
  const cpf = agendamento?.pacientes?.cpf ?? "";
  const iniciais = paciente.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "P";

  // cronômetro
  useEffect(() => {
    if (!open) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const elapsedFmt = `${String(Math.floor(elapsed/60)).padStart(2,"0")}:${String(elapsed%60).padStart(2,"0")}`;

  // ===== Rascunho: restaurar ao abrir =====
  const draftKey = agendamento ? `consultorio:draft:${agendamento.id}` : null;
  useEffect(() => {
    if (!open || !draftKey || restored) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) { setRestored(true); return; }
      const d = JSON.parse(raw);
      setS(d.s ?? ""); setO(d.o ?? ""); setA(d.a ?? ""); setP(d.p ?? "");
      setPa(d.pa ?? ""); setFc(d.fc ?? ""); setFr(d.fr ?? ""); setTemp(d.temp ?? "");
      setSat(d.sat ?? ""); setPeso(d.peso ?? ""); setAltura(d.altura ?? "");
      if (Array.isArray(d.cids)) setCids(d.cids);
      if (Array.isArray(d.alergias)) setAlergias(d.alergias);
      if (Array.isArray(d.meds)) setMeds(d.meds);
      if (d.recTipo) setRecTipo(d.recTipo);
      if (typeof d.recOri === "string") setRecOri(d.recOri);
      if (Array.isArray(d.sadt)) setSadt(d.sadt);
      if (d.sadtCarater) setSadtCarater(d.sadtCarater);
      if (typeof d.sadtIndic === "string") setSadtIndic(d.sadtIndic);
      if (typeof d.atDias === "string") setAtDias(d.atDias);
      if (typeof d.atCid === "string") setAtCid(d.atCid);
      if (typeof d.atRepouso === "boolean") setAtRepouso(d.atRepouso);
      if (typeof d.atMencCid === "boolean") setAtMencCid(d.atMencCid);
      if (d.savedAt) setSavedAt(new Date(d.savedAt));
      toast.success("Rascunho restaurado", { description: "Continuamos de onde você parou." });
    } catch { /* ignore */ }
    setRestored(true);
  }, [open, draftKey, restored]);

  useEffect(() => { if (!open) setRestored(false); }, [open]);

  // ===== Auto-save (debounced) =====
  useEffect(() => {
    if (!open || !draftKey || !restored) return;
    const t = setTimeout(() => {
      try {
        const payload = {
          s, o, a, p, pa, fc, fr, temp, sat, peso, altura,
          cids, alergias, meds, recTipo, recOri,
          sadt, sadtCarater, sadtIndic,
          atDias, atCid, atRepouso, atMencCid,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(draftKey, JSON.stringify(payload));
        setSavedAt(new Date());
      } catch { /* quota / ignore */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [open, draftKey, restored, s, o, a, p, pa, fc, fr, temp, sat, peso, altura, cids, alergias, meds, recTipo, recOri, sadt, sadtCarater, sadtIndic, atDias, atCid, atRepouso, atMencCid]);

  const savedAtFmt = savedAt
    ? `Rascunho salvo às ${String(savedAt.getHours()).padStart(2,"0")}:${String(savedAt.getMinutes()).padStart(2,"0")}`
    : "Auto-save ativo";

  const cidFiltrado = useMemo(() => {
    const q = cidBusca.trim().toLowerCase();
    if (!q) return CID10.slice(0, 12);
    return CID10.filter((c) => c.code.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)).slice(0, 20);
  }, [cidBusca]);

  const toggleCid = (code: string) => setCids((prev) => prev.includes(code) ? prev.filter(x=>x!==code) : [...prev, code]);
  const toggleSadt = (item: string) => setSadt((prev) => prev.includes(item) ? prev.filter(x=>x!==item) : [...prev, item]);

  const addAlergia = () => {
    if (!aSub.trim()) return;
    setAlergias((prev) => [...prev, { id: crypto.randomUUID(), substancia: aSub.trim(), reacao: aReac.trim(), gravidade: aGrav }]);
    setASub(""); setAReac("");
  };
  const addMed = () => {
    if (!medNome.trim()) return;
    setMeds((prev) => [...prev, { id: crypto.randomUUID(), nome: medNome.trim(), apresentacao: medApres.trim() || undefined, posologia: medPos.trim(), qtd: medQtd.trim(), duracao: medDur.trim() }]);
    setMedNome(""); setMedApres(""); setMedPos(""); setMedQtd(""); setMedDur("");
  };

  const usePreset = (m: typeof MEDICAMENTOS_BASE[number]) => {
    setMedNome(m.dcb); setMedApres(m.apresentacao); setMedPos(m.posologia);
    if (m.controle === "antimicrobiano") setRecTipo("antimicrobiano");
    if (m.controle === "controle_especial") setRecTipo("controle_especial");
  };

  const reset = () => {
    setAtend(ATENDIMENTO_DEFAULT); setConduta(CONDUTA_DEFAULT);
    setS(""); setO(""); setA(""); setP(""); setPa(""); setFc(""); setFr(""); setTemp(""); setSat(""); setPeso(""); setAltura("");
    setCids([]); setCidBusca(""); setAlergias([]); setASub(""); setAReac(""); setAGrav("moderada");
    setAtDias("2"); setAtCid(""); setAtRepouso(true); setAtMencCid(false);
    setMeds([]); setMedNome(""); setMedApres(""); setMedPos(""); setMedQtd(""); setMedDur(""); setRecTipo("comum"); setRecOri("");
    setGEsp(""); setGPrior("eletivo"); setGHip(""); setGJust("");
    setSadt([]); setSadtCarater("eletivo"); setSadtIndic("");
    setLmeMed(""); setLmeApres(""); setLmeCid(""); setLmePos(""); setLmeQtd(""); setLmeTempo(""); setLmeAnam(""); setLmeExames("");
    setTab("atendimento");
    setSavedAt(null);
    if (draftKey) { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } }
  };

  const salvarRascunhoManual = () => {
    if (!draftKey) return;
    try {
      const payload = {
        s, o, a, p, pa, fc, fr, temp, sat, peso, altura,
        cids, alergias, meds, recTipo, recOri,
        sadt, sadtCarater, sadtIndic,
        atDias, atCid, atRepouso, atMencCid,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(draftKey, JSON.stringify(payload));
      setSavedAt(new Date());
      toast.success("Rascunho salvo");
    } catch { toast.error("Não foi possível salvar o rascunho."); }
  };

  // Atalhos: Ctrl/Cmd+S salva rascunho, Ctrl/Cmd+Enter finaliza
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); salvarRascunhoManual(); }
      else if (e.key === "Enter") { e.preventDefault(); finalizar(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, s, o, a, p, cids, conduta]);


  const profissional = {
    nome: profile?.nome || agendamento?.profissionais?.nome || user?.email || "Médico(a)",
    crm: "123456", uf: "RJ", cbo: CBO_FAKE,
  };
  const unidade = { nome: agendamento?.unidades?.nome || "UBS", cnes: CNES_FAKE, ine: INE_FAKE, endereco: "Rua das Acácias, 123 — Centro" };

  const handlePrintReceita = () => {
    if (meds.length === 0) { toast.error("Adicione ao menos um medicamento."); return; }
    gerarReceitaPdf({
      tipo: recTipo, paciente: { nome: paciente, cpf, cns: CNS_FAKE, endereco: "—" },
      profissional, unidade,
      medicamentos: meds.map(m => ({ nome: m.nome, apresentacao: m.apresentacao, posologia: m.posologia, qtd: m.qtd, duracao: m.duracao })),
      orientacoes: recOri, usuarioNome: profile?.nome || user?.email,
    });
  };
  const handlePrintSadt = () => {
    if (sadt.length === 0) { toast.error("Selecione ao menos um exame."); return; }
    const exames = EXAMES_SADT.flatMap(g => g.itens.filter(i => sadt.includes(i)).map(i => ({ grupo: g.grupo, item: i })));
    const principal = cids[0] ? CID10.find(c => c.code === cids[0]) ?? null : null;
    gerarSadtPdf({
      paciente: { nome: paciente, cpf, cns: CNS_FAKE, sexo: "—", dn: "—", telefone: agendamento?.pacientes?.telefone, endereco: "—" },
      profissional, unidade,
      cidPrincipal: principal, cidsSecundarios: cids.slice(1),
      hipotese: a || principal?.desc, indicacao: sadtIndic, carater: sadtCarater, exames,
      usuarioNome: profile?.nome || user?.email,
    });
  };
  const handlePrintLme = () => {
    if (!lmeMed.trim() || !lmeCid.trim()) { toast.error("Preencha medicamento e CID-10."); return; }
    gerarLmePdf({
      paciente: { nome: paciente, cpf, cns: CNS_FAKE, sexo: "—", dn: "—", raca: "—", mae: "—", telefone: agendamento?.pacientes?.telefone, endereco: "—" },
      profissional, unidade,
      cid10: lmeCid, diagnostico: CID10.find(c => c.code === lmeCid)?.desc ?? "",
      medicamentos: [{ nome: lmeMed, apresentacao: lmeApres, posologia: lmePos, qtd: lmeQtd }],
      anamnese: lmeAnam, examesPrevios: lmeExames, tempoTratamento: lmeTempo,
      usuarioNome: profile?.nome || user?.email,
    });
  };
  const handlePrintAtestado = () => {
    gerarAtestadoPdf({
      paciente: { nome: paciente, cpf, cns: CNS_FAKE },
      profissional, unidade,
      dias: Number(atDias) || 1, cid: atCid, mencionarCid: atMencCid, repouso: atRepouso,
      usuarioNome: profile?.nome || user?.email,
    });
  };

  const finalizar = () => {
    if (!s && !o && !a && !p) { toast.error("Preencha ao menos um campo do SOAP."); return; }
    if (cids.length === 0) { toast.error("Adicione ao menos um CID-10 (Avaliação)."); return; }
    if (conduta.desfechos.length === 0) { toast.error("Defina ao menos uma conduta/desfecho."); return; }
    setEnviando(true);
  };
  const handleEnvioFechar = () => {
    setEnviando(false);
    const protocolo = `PEC-${Date.now().toString().slice(-10)}`;
    if (agendamento) {
      try {
        saveHistorico({
          id: crypto.randomUUID(),
          agendamento_id: agendamento.id,
          protocolo,
          finalizado_em: new Date().toISOString(),
          duracao_segundos: elapsed,
          medico_email: user?.email ?? "",
          medico_nome: profissional.nome,
          paciente: { nome: paciente, cpf, cns: CNS_FAKE, telefone: agendamento.pacientes?.telefone },
          profissional,
          unidade,
          soap: { s, o, a, p },
          cids,
          vitais: { pa, fc, fr, temp, sat, peso, altura },
          alergias: alergias.map(({ substancia, reacao, gravidade }) => ({ substancia, reacao, gravidade })),
          documentos: {
            ...(meds.length > 0 && { receita: { tipo: recTipo, meds: meds.map(({ nome, apresentacao, posologia, qtd, duracao }) => ({ nome, apresentacao, posologia, qtd, duracao })), orientacoes: recOri } }),
            ...(sadt.length > 0 && { sadt: { exames: sadt, carater: sadtCarater, indicacao: sadtIndic } }),
            ...((lmeMed.trim() && lmeCid.trim()) && { lme: { med: lmeMed, apres: lmeApres, cid: lmeCid, pos: lmePos, qtd: lmeQtd, tempo: lmeTempo, anamnese: lmeAnam, exames: lmeExames } }),
            ...((Number(atDias) > 0) && { atestado: { dias: Number(atDias), cid: atCid, mencionarCid: atMencCid, repouso: atRepouso } }),
          },
        });
      } catch { /* ignore storage errors */ }
      onFinalizado(agendamento.id, protocolo);
    }
    reset();
    onOpenChange(false);
  };

  if (!open || !agendamento) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex flex-col bg-background animate-in fade-in duration-200">
        {/* HEADER ===================================== */}
        <header className="relative shrink-0 border-b bg-card">
          {/* gradient ribbon */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/70 to-emerald-400" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/[0.04] via-transparent to-emerald-400/[0.04]" />
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 lg:gap-4">
            <img src={logoUrl} alt="SpokenMED" className="h-10 w-10 shrink-0 object-contain drop-shadow-sm" />
            <div className="hidden h-10 w-px bg-border lg:block" />

            {/* identidade */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-sm font-bold text-primary-foreground shadow-sm">
                {iniciais}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{paciente}</h1>
                  <Badge variant="secondary" className="text-[10px]"><Stethoscope className="mr-1 h-3 w-3" />Atendimento individual</Badge>
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <BadgeCheck className="mr-1 h-3 w-3" />eSUS PEC · CDS v4.3
                  </Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>CNS <span className="font-mono">{CNS_FAKE}</span></span>
                  {cpf && <span>CPF <span className="font-mono">{cpf}</span></span>}
                  {agendamento.hora_inicio && (
                    <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{formatTime(agendamento.hora_inicio)}</span>
                  )}
                  {agendamento.unidades?.nome && <span className="text-primary/80">{agendamento.unidades.nome} · CNES {CNES_FAKE} · INE {INE_FAKE}</span>}
                </div>
              </div>
            </div>

            {/* cronômetro */}
            <div className="hidden items-center gap-1.5 rounded-lg border bg-card/60 px-3 py-1.5 sm:flex">
              <Timer className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Atendimento</span>
              <span className="font-mono text-sm font-semibold tabular-nums">{elapsedFmt}</span>
            </div>

            {/* actions */}
            <div className="flex items-center gap-1.5">
              <Button onClick={finalizar} className="gap-2 shadow-sm">
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Finalizar e enviar ao eSUS PEC</span>
                <span className="sm:hidden">Finalizar</span>
              </Button>
              <Button
                variant="ghost" size="icon"
                onClick={() => {
                  if (s || o || a || p || meds.length || cids.length) {
                    if (!confirm("Descartar atendimento e fechar?")) return;
                  }
                  reset(); onOpenChange(false);
                }}
                aria-label="Fechar"
              ><X className="h-5 w-5" /></Button>
            </div>
          </div>
        </header>

        {/* BODY ====================================== */}
        <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[320px_1fr]">
          {/* SIDEBAR */}
          <aside className="space-y-3">
            <Card icon={User} title="Resumo do paciente">
              <dl className="space-y-1.5 text-sm">
                <Dl k="Sexo" v="Não informado" />
                <Dl k="Idade" v="—" />
                <Dl k="Raça/Cor" v="—" />
                <Dl k="Telefone" v={agendamento.pacientes?.telefone ?? "—"} />
              </dl>
            </Card>

            <div className={`rounded-xl border p-4 shadow-xs ${alergias.some(a=>a.gravidade==="grave") ? "border-rose-300 bg-rose-50/70 dark:border-rose-900/40 dark:bg-rose-950/20 animate-in fade-in" : "border-rose-200 bg-rose-50/40 dark:border-rose-900/30 dark:bg-rose-950/10"}`}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Alergias ativas
                {alergias.length > 0 && <Badge className="ml-auto bg-rose-600 text-white">{alergias.length}</Badge>}
              </div>
              {alergias.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma alergia registrada.</p>
              ) : (
                <ul className="space-y-1.5">
                  {alergias.map((al) => (
                    <li key={al.id} className="text-xs">
                      <span className="font-semibold">{al.substancia}</span>
                      {al.reacao && <span className="text-muted-foreground"> — {al.reacao}</span>}
                      <Badge variant="outline" className={`ml-1.5 text-[9px] ${al.gravidade==="grave" ? "border-rose-400 text-rose-700" : al.gravidade==="moderada" ? "border-amber-400 text-amber-700" : "border-slate-300 text-slate-600"}`}>
                        {al.gravidade}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Card icon={Activity} title="Sinais vitais">
              <div className="grid grid-cols-2 gap-2">
                <Field label="PA (mmHg)" v={pa} onChange={setPa} placeholder="120x80" />
                <Field label="FC (bpm)" v={fc} onChange={setFc} placeholder="78" />
                <Field label="FR (irpm)" v={fr} onChange={setFr} placeholder="16" />
                <Field label="Temp (°C)" v={temp} onChange={setTemp} placeholder="36,5" />
                <Field label="SatO₂ (%)" v={sat} onChange={setSat} placeholder="98" />
                <Field label="Peso (kg)" v={peso} onChange={setPeso} placeholder="70" />
                <Field label="Altura (cm)" v={altura} onChange={setAltura} placeholder="170" />
                {(() => {
                  const pesoN = parseFloat(peso.replace(",", "."));
                  const altN = parseFloat(altura.replace(",", ".")) / 100;
                  const imc = pesoN > 0 && altN > 0 ? (pesoN / (altN * altN)).toFixed(1) : "";
                  return (
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">IMC</Label>
                      <div className="grid h-8 place-items-center rounded-md border bg-muted/30 text-sm font-semibold tabular-nums">
                        {imc || "—"}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </Card>

            <Card icon={Workflow} title="Status do atendimento">
              <ul className="space-y-1 text-xs">
                <StatusLi ok={!!atend.tipoAtendimento}>Tipo de atendimento</StatusLi>
                <StatusLi ok={!!(s||o||a||p)}>SOAP preenchido</StatusLi>
                <StatusLi ok={cids.length>0}>CID-10 codificado</StatusLi>
                <StatusLi ok={conduta.desfechos.length>0}>Conduta definida</StatusLi>
              </ul>
            </Card>
          </aside>

          {/* MAIN */}
          <main className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <div className="-mx-3 mb-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
                <TabsList className="flex h-auto w-max min-w-full justify-start gap-1 bg-muted/50 p-1">
                  <TT v="atendimento" icon={Stethoscope}>Atendimento</TT>
                  <TT v="soap" icon={HeartPulse}>SOAP</TT>
                  <TT v="cid" icon={FileText}>CID</TT>
                  <TT v="alergias" icon={AlertTriangle}>Alergias</TT>
                  <TT v="conduta" icon={Workflow}>Conduta</TT>
                  <TT v="receita" icon={Pill}>Receita</TT>
                  <TT v="atestado" icon={FileSignature}>Atestado</TT>
                  <TT v="sadt" icon={FlaskConical}>SADT</TT>
                  <TT v="guia" icon={Send}>Guia</TT>
                  <TT v="lme" icon={ClipboardList}>LME</TT>
                </TabsList>
              </div>

              {/* ATENDIMENTO */}
              <TabsContent value="atendimento" className="mt-0 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <TabAtendimento v={atend} set={setAtend} />
              </TabsContent>

              {/* SOAP */}
              <TabsContent value="soap" className="mt-0 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <SoapBox color="sky" letter="S" label="Subjetivo" hint="Queixa, história, contexto" v={s} onChange={setS} />
                <SoapBox color="emerald" letter="O" label="Objetivo" hint="Exame físico, sinais" v={o} onChange={setO} />
                <SoapBox color="amber" letter="A" label="Avaliação" hint="Hipóteses, problemas" v={a} onChange={setA} />
                <SoapBox color="violet" letter="P" label="Plano" hint="Conduta, orientações, retorno" v={p} onChange={setP} />
              </TabsContent>

              {/* CID */}
              <TabsContent value="cid" className="mt-0 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div>
                  <Label className="text-xs">Buscar CID-10</Label>
                  <Input value={cidBusca} onChange={(e) => setCidBusca(e.target.value)} placeholder="Ex.: I10, hipertensão, J00…" />
                </div>
                {cids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cids.map((c) => {
                      const item = CID10.find((x) => x.code === c);
                      return (
                        <Badge key={c} variant="default" className="cursor-pointer gap-1" onClick={() => toggleCid(c)}>
                          {c}{item?.desc && <span className="font-normal opacity-80">· {item.desc.slice(0,28)}</span>}<X className="h-3 w-3" />
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                  {cidFiltrado.map((c) => (
                    <li key={c.code} onClick={() => toggleCid(c.code)}
                      className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-accent ${cids.includes(c.code) ? "bg-primary/5" : ""}`}>
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-semibold">{c.code}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.desc}</div>
                      </div>
                      <Checkbox checked={cids.includes(c.code)} />
                    </li>
                  ))}
                </ul>
              </TabsContent>

              {/* ALERGIAS */}
              <TabsContent value="alergias" className="mt-0 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
                  <Input placeholder="Substância (Dipirona)" value={aSub} onChange={(e) => setASub(e.target.value)} />
                  <Input placeholder="Reação (urticária)" value={aReac} onChange={(e) => setAReac(e.target.value)} />
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

              {/* CONDUTA */}
              <TabsContent value="conduta" className="mt-0 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <TabConduta v={conduta} set={setConduta} />
              </TabsContent>

              {/* RECEITA */}
              <TabsContent value="receita" className="mt-0 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1.5">
                    {([
                      ["comum", "Comum (branca)"],
                      ["controle_especial", "Controle especial (2 vias)"],
                      ["antimicrobiano", "Antimicrobiano (2 vias)"],
                    ] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setRecTipo(v)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${recTipo===v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" onClick={handlePrintReceita} disabled={meds.length===0}>
                    <Printer className="mr-1.5 h-4 w-4" />Imprimir receita
                  </Button>
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <Label className="text-xs text-muted-foreground">Adicionar medicamento</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr_0.6fr_0.6fr_auto]">
                    <Input list="meds-list" placeholder="DCB / nome" value={medNome} onChange={(e) => setMedNome(e.target.value)} />
                    <datalist id="meds-list">
                      {MEDICAMENTOS_BASE.map((m) => <option key={m.dcb + m.apresentacao} value={m.dcb}>{m.dcb} {m.apresentacao}</option>)}
                    </datalist>
                    <Input placeholder="Apresentação" value={medApres} onChange={(e) => setMedApres(e.target.value)} />
                    <Input placeholder="Posologia" value={medPos} onChange={(e) => setMedPos(e.target.value)} />
                    <Input placeholder="Qtd" value={medQtd} onChange={(e) => setMedQtd(e.target.value)} />
                    <Input placeholder="Duração" value={medDur} onChange={(e) => setMedDur(e.target.value)} />
                    <Button onClick={addMed}><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Sugestões rápidas</div>
                    <div className="flex flex-wrap gap-1">
                      {MEDICAMENTOS_BASE.slice(0, 10).map((m) => (
                        <button key={m.dcb + m.apresentacao} onClick={() => usePreset(m)}
                          className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground">
                          {m.dcb} {m.apresentacao}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {meds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum medicamento adicionado.</p>
                ) : (
                  <ol className="divide-y rounded-lg border">
                    {meds.map((m, idx) => (
                      <li key={m.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-[10px] font-semibold text-primary">{idx+1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{m.nome}{m.apresentacao && <span className="text-muted-foreground"> — {m.apresentacao}</span>}</div>
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

                <div>
                  <Label className="text-xs">Orientações ao paciente</Label>
                  <Textarea rows={3} value={recOri} onChange={(e) => setRecOri(e.target.value)} placeholder="Tomar com bastante água, evitar bebidas alcoólicas…" />
                </div>
              </TabsContent>

              {/* ATESTADO */}
              <TabsContent value="atestado" className="mt-0 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div><Label className="text-xs">Dias de afastamento</Label>
                    <Input type="number" min={1} max={90} value={atDias} onChange={(e) => setAtDias(e.target.value)} /></div>
                  <div><Label className="text-xs">CID (opcional)</Label>
                    <Input placeholder="Ex.: J06.9" value={atCid} onChange={(e) => setAtCid(e.target.value)} /></div>
                  <label className="flex items-end gap-2 pb-2">
                    <Checkbox checked={atRepouso} onCheckedChange={(v) => setAtRepouso(!!v)} />
                    <span className="text-sm">Repouso domiciliar</span>
                  </label>
                  <label className="flex items-end gap-2 pb-2">
                    <Checkbox checked={atMencCid} onCheckedChange={(v) => setAtMencCid(!!v)} />
                    <span className="text-sm">Mencionar CID</span>
                  </label>
                </div>
                <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-relaxed">
                  <p className="text-center font-semibold uppercase tracking-wide">Atestado médico</p>
                  <p className="mt-3">
                    Atesto, para os devidos fins, que o(a) Sr(a). <strong>{paciente}</strong>
                    {cpf && <> (CPF {cpf})</>} esteve sob meus cuidados profissionais nesta data,
                    necessitando de afastamento de suas atividades habituais pelo período de{" "}
                    <strong>{atDias || "—"}</strong> dia(s){atRepouso && ", em repouso domiciliar"}
                    {atMencCid && atCid && <> (CID {atCid})</>}.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={handlePrintAtestado}>
                    <Printer className="mr-1.5 h-4 w-4" />Imprimir atestado
                  </Button>
                </div>
              </TabsContent>

              {/* SADT */}
              <TabsContent value="sadt" className="mt-0 space-y-4 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-xs">Caráter</Label>
                    <Select value={sadtCarater} onValueChange={(v) => setSadtCarater(v as any)}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eletivo">Eletivo</SelectItem>
                        <SelectItem value="prioritario">Prioritário</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" variant="outline" onClick={handlePrintSadt} disabled={sadt.length===0}>
                    <Printer className="mr-1.5 h-4 w-4" />Imprimir SADT
                  </Button>
                </div>
                <div>
                  <Label className="text-xs">Indicação clínica</Label>
                  <Textarea rows={2} value={sadtIndic} onChange={(e) => setSadtIndic(e.target.value)} placeholder="Justificativa para o exame…" />
                </div>
                {EXAMES_SADT.map((g) => (
                  <div key={g.grupo}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.grupo}</div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {g.itens.map((it) => (
                        <label key={it} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-all ${sadt.includes(it) ? "border-primary bg-primary/8" : "hover:bg-accent"}`}>
                          <Checkbox checked={sadt.includes(it)} onCheckedChange={() => toggleSadt(it)} />
                          <span>{it}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {sadt.length > 0 && (
                  <div className="sticky bottom-0 rounded-lg border bg-primary/5 p-3 text-xs">
                    <strong>{sadt.length}</strong> exame(s) selecionado(s) · Caráter: {sadtCarater}
                  </div>
                )}
              </TabsContent>

              {/* GUIA */}
              <TabsContent value="guia" className="mt-0 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label className="text-xs">Especialidade</Label>
                    <Input placeholder="Ex.: Cardiologia" value={gEsp} onChange={(e) => setGEsp(e.target.value)} /></div>
                  <div><Label className="text-xs">Prioridade</Label>
                    <Select value={gPrior} onValueChange={(v) => setGPrior(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eletivo">Eletivo</SelectItem>
                        <SelectItem value="prioritario">Prioritário</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-xs">Hipótese diagnóstica</Label>
                  <Input value={gHip} onChange={(e) => setGHip(e.target.value)} /></div>
                <div><Label className="text-xs">Justificativa clínica</Label>
                  <Textarea rows={4} value={gJust} onChange={(e) => setGJust(e.target.value)} /></div>
              </TabsContent>

              {/* LME */}
              <TabsContent value="lme" className="mt-0 space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                    LME — Componente Especializado da Assistência Farmacêutica
                  </div>
                  <Button size="sm" variant="outline" onClick={handlePrintLme}>
                    <Printer className="mr-1.5 h-4 w-4" />Imprimir LME
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label className="text-xs">Medicamento (DCB)</Label>
                    <Input value={lmeMed} onChange={(e) => setLmeMed(e.target.value)} /></div>
                  <div><Label className="text-xs">Apresentação</Label>
                    <Input value={lmeApres} onChange={(e) => setLmeApres(e.target.value)} placeholder="Ex.: 25mg comprimido" /></div>
                  <div><Label className="text-xs">CID-10 (obrigatório)</Label>
                    <Input placeholder="Ex.: M05" value={lmeCid} onChange={(e) => setLmeCid(e.target.value)} /></div>
                  <div><Label className="text-xs">Posologia</Label>
                    <Input value={lmePos} onChange={(e) => setLmePos(e.target.value)} /></div>
                  <div><Label className="text-xs">Quantidade / mês</Label>
                    <Input value={lmeQtd} onChange={(e) => setLmeQtd(e.target.value)} /></div>
                  <div><Label className="text-xs">Tempo de tratamento</Label>
                    <Input placeholder="Ex.: 6 meses" value={lmeTempo} onChange={(e) => setLmeTempo(e.target.value)} /></div>
                </div>
                <div><Label className="text-xs">Anamnese / justificativa clínica</Label>
                  <Textarea rows={4} value={lmeAnam} onChange={(e) => setLmeAnam(e.target.value)} /></div>
                <div><Label className="text-xs">Exames complementares</Label>
                  <Textarea rows={3} value={lmeExames} onChange={(e) => setLmeExames(e.target.value)} /></div>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>

      <EnvioEsusOverlay open={enviando} onClose={handleEnvioFechar} pacienteNome={paciente} />
    </>
  );
}

/* ---------- helpers ---------- */
function TT({ v, icon: Icon, children }: { v: string; icon: any; children: React.ReactNode }) {
  return (
    <TabsTrigger value={v} className="gap-1.5 whitespace-nowrap data-[state=active]:bg-card data-[state=active]:shadow-sm">
      <Icon className="h-3.5 w-3.5" />{children}
    </TabsTrigger>
  );
}
function Card({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      {children}
    </div>
  );
}
function Dl({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}
function Field({ label, v, onChange, placeholder }: { label: string; v: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
    </div>
  );
}
function StatusLi({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${ok ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
        {ok ? "✓" : "·"}
      </span>
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}

const SOAP_TONE = {
  sky:     "border-sky-200 from-sky-50 to-transparent text-sky-700 dark:border-sky-900/40 dark:text-sky-300",
  emerald: "border-emerald-200 from-emerald-50 to-transparent text-emerald-700 dark:border-emerald-900/40 dark:text-emerald-300",
  amber:   "border-amber-200 from-amber-50 to-transparent text-amber-700 dark:border-amber-900/40 dark:text-amber-300",
  violet:  "border-violet-200 from-violet-50 to-transparent text-violet-700 dark:border-violet-900/40 dark:text-violet-300",
} as const;

function SoapBox({ color, letter, label, hint, v, onChange }: { color: keyof typeof SOAP_TONE; letter: string; label: string; hint: string; v: string; onChange: (s: string) => void }) {
  const tone = SOAP_TONE[color];
  return (
    <div className={`overflow-hidden rounded-xl border bg-gradient-to-br ${tone} shadow-xs`}>
      <div className="flex items-center gap-3 border-b border-current/10 bg-card/60 px-3 py-2">
        <div className={`grid h-7 w-7 place-items-center rounded-md bg-current/10 font-bold ${tone.split(" ").filter(c=>c.startsWith("text-")).join(" ")}`}>
          {letter}
        </div>
        <div className="flex-1">
          <Label className="text-sm font-semibold">{label}</Label>
          <div className="text-[10px] text-muted-foreground">{hint}</div>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{v.length} car.</span>
      </div>
      <Textarea rows={4} value={v} onChange={(e) => onChange(e.target.value)} className="resize-y border-0 bg-card/40 focus-visible:ring-0" />
    </div>
  );
}
