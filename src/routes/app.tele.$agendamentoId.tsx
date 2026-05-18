import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { criarSalaTele, gerarTokenMedico, iniciarGravacao, pararGravacao, salvarResumo, encerrarSala } from "@/lib/tele.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DailyEmbed } from "@/components/tele/DailyEmbed";
import { Video, Copy, Loader2, Circle, Square, Save } from "lucide-react";
import { toast } from "sonner";
import { SemAcesso } from "@/components/sem-acesso";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/tele/$agendamentoId")({
  component: Guard,
});

function Guard() {
  const { profile } = useAuth();
  // libera para qualquer staff médico/admin/recepção
  if (!profile) return <SemAcesso />;
  return <TeleAtendimento />;
}

function TeleAtendimento() {
  const { agendamentoId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const criar = useServerFn(criarSalaTele);
  const tokenMedico = useServerFn(gerarTokenMedico);
  const startRec = useServerFn(iniciarGravacao);
  const stopRec = useServerFn(pararGravacao);
  const salvar = useServerFn(salvarResumo);
  const encerrar = useServerFn(encerrarSala);

  const [meeting, setMeeting] = useState<{ url: string; token: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [resumo, setResumo] = useState("");
  const [notas, setNotas] = useState("");
  const [publicar, setPublicar] = useState(true);

  const { data: ag } = useQuery({
    queryKey: ["ag-tele", agendamentoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, data, hora_inicio, modalidade, pacientes(nome), profissionais(nome)")
        .eq("id", agendamentoId).single();
      return data;
    },
  });

  const { data: sala, refetch: refetchSala } = useQuery({
    queryKey: ["sala-tele", agendamentoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teleconsulta_salas")
        .select("id, daily_room_name, daily_room_url, token_paciente, gravar, consentimento_gravacao, status")
        .eq("agendamento_id", agendamentoId).maybeSingle();
      return data;
    },
  });

  const linkPaciente = sala ? `${window.location.origin}/tele/${sala.token_paciente}` : "";

  const handleCriarOuEntrar = async () => {
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
    }
  };

  const handleStartRec = async () => {
    if (!sala) return;
    try { await startRec({ data: { sala_id: sala.id } }); setGravando(true); toast.success("Gravação iniciada"); }
    catch (e: any) { toast.error(e?.message); }
  };
  const handleStopRec = async () => {
    if (!sala) return;
    try { await stopRec({ data: { sala_id: sala.id } }); setGravando(false); toast.success("Gravação encerrada"); }
    catch (e: any) { toast.error(e?.message); }
  };

  const handleSalvarResumo = async () => {
    try {
      await salvar({ data: { agendamento_id: agendamentoId, resumo_paciente: resumo, notas_internas: notas, publicar } });
      toast.success("Resumo salvo" + (publicar ? " e publicado ao paciente" : ""));
    } catch (e: any) { toast.error(e?.message); }
  };

  const handleEncerrar = async () => {
    if (sala) await encerrar({ data: { sala_id: sala.id } });
    qc.invalidateQueries();
    navigate({ to: "/app/agenda-dia", search: { data: ag?.data } as any });
  };

  const copiarLink = async () => {
    await navigator.clipboard.writeText(linkPaciente);
    toast.success("Link copiado");
  };
  const whatsapp = () => {
    const msg = encodeURIComponent(`Olá! Sua teleconsulta no SpokenMED está pronta. Acesse no horário marcado: ${linkPaciente}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="lg:row-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Video className="h-5 w-5 text-primary" /> Teleconsulta
            </CardTitle>
            <CardDescription>
              {(ag as any)?.pacientes?.nome} · {(ag as any)?.profissionais?.nome}
            </CardDescription>
          </div>
          {sala && <Badge variant={sala.status === "encerrada" ? "secondary" : "default"}>{sala.status}</Badge>}
        </CardHeader>
        <CardContent>
          {!meeting ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {sala ? "Sala já criada. Pronto para entrar." : "Crie a sala de vídeo e envie o link ao paciente."}
              </p>
              <Button size="lg" onClick={handleCriarOuEntrar}>
                <Video className="mr-2 h-5 w-5" /> {sala ? "Entrar na sala" : "Criar sala e entrar"}
              </Button>
              {sala && (
                <div className="w-full max-w-lg space-y-2 rounded-md border bg-muted/40 p-3 text-left">
                  <Label className="text-xs">Link do paciente</Label>
                  <div className="flex gap-2">
                    <input className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs" readOnly value={linkPaciente} />
                    <Button size="sm" variant="outline" onClick={copiarLink}><Copy className="h-3 w-3" /></Button>
                  </div>
                  <Button size="sm" variant="secondary" className="w-full" onClick={whatsapp}>Enviar por WhatsApp</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="h-[60vh] min-h-[420px] w-full">
              <DailyEmbed url={meeting.url} token={meeting.token} onLeft={() => setMeeting(null)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Controles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sala && (
            <>
              <div className="rounded-md border p-3 text-xs">
                Consentimento de gravação:{" "}
                <strong>{sala.consentimento_gravacao ? "Autorizado" : "Pendente"}</strong>
              </div>
              {!gravando ? (
                <Button variant="outline" className="w-full" disabled={!sala.consentimento_gravacao || !meeting} onClick={handleStartRec}>
                  <Circle className="mr-2 h-4 w-4 fill-red-500 text-red-500" /> Iniciar gravação
                </Button>
              ) : (
                <Button variant="outline" className="w-full" onClick={handleStopRec}>
                  <Square className="mr-2 h-4 w-4" /> Parar gravação
                </Button>
              )}
            </>
          )}
          <Button variant="destructive" className="w-full" onClick={handleEncerrar}>
            Encerrar atendimento
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo do atendimento</CardTitle>
          <CardDescription>O resumo publicado fica visível no Painel do Cidadão.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="resumo">Resumo para o paciente</Label>
            <Textarea id="resumo" rows={5} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Diagnóstico, condutas, orientações…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas internas (não visíveis ao paciente)</Label>
            <Textarea id="notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <label className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span>Publicar para o paciente</span>
            <Switch checked={publicar} onCheckedChange={setPublicar} />
          </label>
          <Button className="w-full" onClick={handleSalvarResumo}>
            <Save className="mr-2 h-4 w-4" /> Salvar resumo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
