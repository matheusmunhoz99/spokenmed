import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  criarSalaTele,
  gerarTokenMedico,
  iniciarGravacao,
  pararGravacao,
  salvarResumo,
  encerrarSala,
} from "@/lib/tele.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription,
} from "@/components/ui/sheet";
import { CallStage, CallDurationBadge, type CallStageHandle } from "@/components/tele/CallStage";
import {
  Video, Copy, Loader2, Circle, Square, Save, ShieldCheck, ShieldAlert, MessageCircle,
  ArrowLeft, UserRound, Stethoscope, FileText, Calendar, Send,
} from "lucide-react";
import { toast } from "sonner";
import { SemAcesso } from "@/components/sem-acesso";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/app/tele/$agendamentoId")({
  head: () => ({
    meta: [
      { title: "Teleconsulta — SpokenMED" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Guard,
});

function Guard() {
  const { profile } = useAuth();
  if (!profile) return <SemAcesso />;
  return <TeleAtendimento />;
}

const STATUS_VARIANT: Record<string, { label: string; cls: string }> = {
  agendada:    { label: "Agendada",    cls: "bg-sky-500/20 text-sky-100 ring-1 ring-sky-300/40" },
  em_andamento:{ label: "Em andamento",cls: "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-300/40" },
  encerrada:   { label: "Encerrada",   cls: "bg-zinc-500/30 text-zinc-100 ring-1 ring-zinc-300/40" },
  cancelada:   { label: "Cancelada",   cls: "bg-red-500/25 text-red-100 ring-1 ring-red-300/40" },
};

function TeleAtendimento() {
  const { agendamentoId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const stageRef = useRef<CallStageHandle | null>(null);

  const criar = useServerFn(criarSalaTele);
  const tokenMedico = useServerFn(gerarTokenMedico);
  const startRec = useServerFn(iniciarGravacao);
  const stopRec = useServerFn(pararGravacao);
  const salvar = useServerFn(salvarResumo);
  const encerrar = useServerFn(encerrarSala);

  const [meeting, setMeeting] = useState<{ url: string; token: string } | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [resumo, setResumo] = useState("");
  const [notas, setNotas] = useState("");
  const [publicar, setPublicar] = useState(true);

  const { data: ag } = useQuery({
    queryKey: ["ag-tele", agendamentoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, data, hora_inicio, modalidade, pacientes(nome, telefone), profissionais(nome, cbo, especialidades(nome))")
        .eq("id", agendamentoId)
        .single();
      return data as any;
    },
  });

  const { data: sala, refetch: refetchSala } = useQuery({
    queryKey: ["sala-tele", agendamentoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teleconsulta_salas")
        .select("id, daily_room_name, daily_room_url, token_paciente, gravar, consentimento_gravacao, status, iniciada_em")
        .eq("agendamento_id", agendamentoId)
        .maybeSingle();
      return data as any;
    },
    refetchInterval: meeting ? 5000 : false,
  });

  // Realtime: paciente aceita gravação / status muda
  useEffect(() => {
    if (!sala?.id) return;
    const ch = supabase
      .channel(`tele-sala-${sala.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "teleconsulta_salas", filter: `id=eq.${sala.id}` },
        () => { refetchSala(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sala?.id, refetchSala]);

  const linkPaciente = sala ? `${window.location.origin}/tele/${sala.token_paciente}` : "";
  const pacienteNome = ag?.pacientes?.nome || "Paciente";
  const profissionalNome = ag?.profissionais?.nome || profile?.nome || "Médico(a)";
  const especialidade = ag?.profissionais?.especialidades?.nome || "";
  const status = (sala?.status as keyof typeof STATUS_VARIANT) || "agendada";
  const statusInfo = STATUS_VARIANT[status] || STATUS_VARIANT.agendada;

  const handleCriarOuEntrar = async () => {
    setBusy(true);
    try {
      let s = sala;
      if (!s) {
        const r = await criar({ data: { agendamento_id: agendamentoId, gravar: false } });
        s = r.sala as any;
        await refetchSala();
      }
      const t = await tokenMedico({ data: { sala_id: s!.id } });
      setMeeting({ url: t.room_url, token: t.token });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao iniciar sala");
    } finally {
      setBusy(false);
    }
  };

  const handleStartRec = async () => {
    if (!sala) return;
    if (!sala.consentimento_gravacao) {
      toast.error("Paciente ainda não autorizou a gravação");
      return;
    }
    try { await startRec({ data: { sala_id: sala.id } }); setGravando(true); toast.success("Gravação iniciada"); }
    catch (e: any) { toast.error(e?.message); }
  };
  const handleStopRec = async () => {
    if (!sala) return;
    try {
      await stopRec({ data: { sala_id: sala.id } });
      setGravando(false);
      toast.success("Gravação encerrada");
      await refetchSala();
    } catch (e: any) { toast.error(e?.message); }
  };

  const handleSalvarResumo = async () => {
    try {
      await salvar({ data: { agendamento_id: agendamentoId, resumo_paciente: resumo, notas_internas: notas, publicar } });
      toast.success("Resumo salvo" + (publicar ? " e publicado ao paciente" : ""));
    } catch (e: any) { toast.error(e?.message); }
  };

  const handleEncerrar = async () => {
    if (gravando && sala) {
      try { await stopRec({ data: { sala_id: sala.id } }); } catch (_) {}
      setGravando(false);
    }
    try { await stageRef.current?.leave(); } catch (_) {}
    if (sala) await encerrar({ data: { sala_id: sala.id } });
    setMeeting(null);
    setCallStartedAt(null);
    qc.invalidateQueries();
    toast.success("Atendimento encerrado");
    navigate({ to: "/app/agenda-dia", search: { data: ag?.data } as any });
  };

  const copiarLink = async () => {
    await navigator.clipboard.writeText(linkPaciente);
    toast.success("Link copiado");
  };
  const whatsapp = () => {
    const tel = (ag?.pacientes?.telefone || "").replace(/\D/g, "");
    const msg = encodeURIComponent(
      `Olá ${pacienteNome}! Sua teleconsulta no SpokenMED está pronta. Acesse no horário marcado:\n${linkPaciente}`,
    );
    const base = tel ? `https://wa.me/55${tel}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(base, "_blank");
  };

  // ====== TELA EM CHAMADA ======
  if (meeting) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <CallStage
          ref={stageRef}
          url={meeting.url}
          token={meeting.token}
          peerName={pacienteNome}
          selfName={profissionalNome}
          recording={gravando}
          onJoined={() => setCallStartedAt(Date.now())}
          onLeft={handleEncerrar}
          topLeft={
            <div className="flex items-center gap-3 rounded-full bg-black/40 py-1.5 pl-1.5 pr-3 backdrop-blur">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 text-sm font-semibold">
                {pacienteNome.charAt(0).toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">{pacienteNome}</div>
                <div className="text-[11px] opacity-70">Teleconsulta · {especialidade || "Consulta"}</div>
              </div>
              <CallDurationBadge startedAt={callStartedAt} />
            </div>
          }
          topRight={
            <Sheet>
              <SheetTrigger asChild>
                <button className="flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm font-medium backdrop-blur hover:bg-white/25">
                  <FileText className="h-4 w-4" /> Resumo
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Resumo do atendimento</SheetTitle>
                  <SheetDescription>
                    Visível ao paciente no Painel do Cidadão quando publicado.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="r">Resumo para o paciente</Label>
                    <Textarea id="r" rows={6} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Diagnóstico, condutas, orientações…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="n">Notas internas</Label>
                    <Textarea id="n" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
                  </div>
                  <label className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <span>Publicar para o paciente</span>
                    <Switch checked={publicar} onCheckedChange={setPublicar} />
                  </label>
                  <Button className="w-full" onClick={handleSalvarResumo}><Save className="mr-2 h-4 w-4" /> Salvar</Button>
                </div>
              </SheetContent>
            </Sheet>
          }
          extraControls={
            <>
              {!gravando ? (
                <button
                  onClick={handleStartRec}
                  disabled={!sala?.consentimento_gravacao}
                  title={sala?.consentimento_gravacao ? "Iniciar gravação" : "Aguardando consentimento do paciente"}
                  className="hidden h-12 items-center gap-2 rounded-full bg-white/15 px-4 text-sm backdrop-blur transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40 sm:flex"
                >
                  <Circle className="h-4 w-4 fill-red-500 text-red-500" /> Gravar
                </button>
              ) : (
                <button
                  onClick={handleStopRec}
                  className="hidden h-12 items-center gap-2 rounded-full bg-red-600 px-4 text-sm shadow-lg backdrop-blur transition hover:bg-red-700 sm:flex"
                >
                  <Square className="h-4 w-4" /> Parar
                </button>
              )}
            </>
          }
        />
      </div>
    );
  }

  // ====== TELA DE SALA DE ESPERA / PRÉ-CHAMADA ======
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/agenda-dia", search: { data: ag?.data } as any })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        <span className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.cls.replace("text-emerald-100", "text-emerald-700 dark:text-emerald-200").replace("text-sky-100", "text-sky-700 dark:text-sky-200").replace("text-zinc-100", "text-zinc-700 dark:text-zinc-200").replace("text-red-100", "text-red-700 dark:text-red-200")}`}>
          {statusInfo.label}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Card principal: pré-call */}
        <Card className="overflow-hidden">
          <div className="relative bg-gradient-to-br from-slate-900 via-zinc-900 to-black p-6 text-white sm:p-10">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="absolute inset-0 -m-2 animate-ping rounded-full bg-sky-400/30" />
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 text-3xl font-bold shadow-2xl">
                  {pacienteNome.charAt(0).toUpperCase()}
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-semibold">{pacienteNome}</h1>
                <p className="text-sm opacity-80">
                  {especialidade ? `${especialidade} · ` : ""}
                  {profissionalNome}
                </p>
              </div>
              {ag?.data && (
                <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm backdrop-blur">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(ag.data + "T00:00:00"), "PPP", { locale: ptBR })} às {String(ag.hora_inicio).slice(0,5)}
                </div>
              )}
              <Button
                size="lg"
                className="mt-2 h-14 gap-2 rounded-full bg-emerald-500 px-8 text-base font-semibold shadow-2xl hover:bg-emerald-600"
                onClick={handleCriarOuEntrar}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />}
                {sala ? "Entrar na chamada" : "Criar sala e entrar"}
              </Button>
              <p className="text-xs opacity-70">A chamada é criptografada de ponta a ponta pelo provedor.</p>
            </div>
          </div>

          {sala && (
            <CardContent className="space-y-3 pt-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Link do paciente</Label>
              <div className="flex gap-2">
                <input className="flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs" readOnly value={linkPaciente} />
                <Button size="sm" variant="outline" onClick={copiarLink}><Copy className="h-4 w-4" /></Button>
              </div>
              <Button variant="secondary" className="w-full gap-2" onClick={whatsapp}>
                <Send className="h-4 w-4" /> Enviar por WhatsApp
              </Button>
              <p className="text-[11px] text-muted-foreground">
                O paciente entra usando apenas este link, sem cadastro.
              </p>
            </CardContent>
          )}
        </Card>

        {/* Card lateral: info + gravação */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Stethoscope className="h-4 w-4 text-primary" /> Atendimento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{pacienteNome}</div>
                  <div className="text-xs text-muted-foreground">Paciente</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Stethoscope className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{profissionalNome}</div>
                  <div className="text-xs text-muted-foreground">{especialidade || "Profissional"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {sala?.consentimento_gravacao
                  ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  : <ShieldAlert className="h-4 w-4 text-amber-600" />}
                Gravação
              </CardTitle>
              <CardDescription className="text-xs">
                Só inicia após o paciente autorizar pelo link.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                Consentimento:{" "}
                <strong className={sala?.consentimento_gravacao ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
                  {sala?.consentimento_gravacao ? "Autorizado" : "Pendente"}
                </strong>
              </div>
              {!gravando ? (
                <Button variant="outline" className="w-full" disabled={!sala?.consentimento_gravacao} onClick={handleStartRec}>
                  <Circle className="mr-2 h-4 w-4 fill-red-500 text-red-500" /> Iniciar gravação
                </Button>
              ) : (
                <Button variant="destructive" className="w-full" onClick={handleStopRec}>
                  <Square className="mr-2 h-4 w-4" /> Parar gravação
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" /> Resumo do atendimento
              </CardTitle>
              <CardDescription className="text-xs">Publicado fica visível no Painel do Cidadão.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={4} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Resumo para o paciente…" />
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas internas (não visíveis)" />
              <label className="flex items-center justify-between rounded-md border p-2 text-xs">
                <span>Publicar para o paciente</span>
                <Switch checked={publicar} onCheckedChange={setPublicar} />
              </label>
              <Button size="sm" className="w-full" onClick={handleSalvarResumo}>
                <Save className="mr-2 h-4 w-4" /> Salvar resumo
              </Button>
            </CardContent>
          </Card>

          {sala && (
            <Button variant="destructive" className="w-full" onClick={handleEncerrar}>
              Encerrar atendimento
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
