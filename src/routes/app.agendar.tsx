import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Search, Check, Calendar as CalIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { formatCPF, formatCNS, formatTime, onlyDigits } from "@/lib/format";
import { gerarComprovante } from "@/lib/pdf-comprovante";

import { SemAcesso } from "@/components/sem-acesso";
function AgendarGuard() {
  const { can } = useAuth();
  if (!can("agendar")) return <SemAcesso />;
  return <AgendarPage />;
}
export const Route = createFileRoute("/app/agendar")({ component: AgendarGuard });

function AgendarPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: unidadesAllowed } = useAllowedUnidades();

  const [unidadeId, setUnidadeId] = useState("");
  const [especialidadeId, setEspecialidadeId] = useState("");
  const [profId, setProfId] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [slot, setSlot] = useState<any>(null);
  const [paciente, setPaciente] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [comprovanteOpen, setComprovanteOpen] = useState(false);
  const [ultimoAgendamentoId, setUltimoAgendamentoId] = useState<string | null>(null);

  useEffect(() => {
    if (!unidadeId && unidadesAllowed && unidadesAllowed.length > 0) setUnidadeId(unidadesAllowed[0].id);
  }, [unidadesAllowed, unidadeId]);

  const { data: especs } = useQuery({
    queryKey: ["especialidades-ag"],
    queryFn: async () => (await supabase.from("especialidades").select("id, nome").eq("ativo", true).order("nome")).data ?? [],
  });

  const { data: profs } = useQuery({
    queryKey: ["profs-ag", unidadeId, especialidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("profissional_unidades")
        .select("profissionais(id, nome, especialidade_id, ativo, especialidades(nome))")
        .eq("unidade_id", unidadeId);
      return (rows ?? [])
        .map((r: any) => r.profissionais)
        .filter((p: any) => p && p.ativo && (especialidadeId === "all" || !especialidadeId || p.especialidade_id === especialidadeId));
    },
  });

  useEffect(() => { setProfId(""); setSlot(null); }, [especialidadeId, unidadeId]);
  useEffect(() => { setSlot(null); }, [profId, data]);

  const { data: slots } = useQuery({
    queryKey: ["slots-ag", profId, data, unidadeId],
    enabled: !!profId && !!data && !!unidadeId,
    queryFn: async () => {
      const { data: rows } = await supabase.from("slots")
        .select("id, hora_inicio, hora_fim, status")
        .eq("profissional_id", profId).eq("data", data).eq("unidade_id", unidadeId).eq("status", "livre")
        .order("hora_inicio");
      return rows ?? [];
    },
  });

  const { data: pacResults } = useQuery({
    queryKey: ["pac-search-ag", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const term = search.trim();
      const digits = onlyDigits(term);
      let q = supabase.from("pacientes").select("id, nome, cpf, cns, telefone").limit(10);
      if (digits.length >= 3) q = q.or(`cpf.ilike.%${digits}%,cns.ilike.%${digits}%`);
      else q = q.ilike("nome", `%${term}%`);
      return (await q).data ?? [];
    },
  });

  const canConfirm = slot && paciente;

  const handleAgendar = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    const { error: e1 } = await supabase.from("slots").update({ status: "reservado" }).eq("id", slot.id).eq("status", "livre");
    if (e1) { setSubmitting(false); return toast.error("Vaga não está mais livre."); }
    const { data: created, error: e2 } = await supabase.from("agendamentos").insert({
      slot_id: slot.id, paciente_id: paciente.id, profissional_id: profId, unidade_id: unidadeId,
      data, hora_inicio: slot.hora_inicio,
      motivo: motivo || null, criado_por: user?.id,
    }).select("id").single();
    setSubmitting(false);
    if (e2 || !created) {
      await supabase.from("slots").update({ status: "livre" }).eq("id", slot.id);
      return toast.error(e2?.message ?? "Erro ao agendar");
    }
    toast.success("Consulta agendada!");
    qc.invalidateQueries();
    setUltimoAgendamentoId(created.id);
    setComprovanteOpen(true);
  };

  const imprimirComprovante = async () => {
    if (!ultimoAgendamentoId) return;
    const { data: ag } = await supabase
      .from("agendamentos")
      .select("id, data, hora_inicio, motivo, pacientes(nome, cpf, cns, telefone), profissionais(nome, especialidades(nome)), unidades(nome, endereco, telefone)")
      .eq("id", ultimoAgendamentoId)
      .single();
    if (!ag) return toast.error("Não foi possível carregar o comprovante");
    gerarComprovante({
      codigo: ag.id,
      data: ag.data,
      hora: ag.hora_inicio,
      paciente: {
        nome: (ag.pacientes as any)?.nome ?? "—",
        cpf: (ag.pacientes as any)?.cpf,
        cns: (ag.pacientes as any)?.cns,
        telefone: (ag.pacientes as any)?.telefone,
      },
      profissional: {
        nome: (ag.profissionais as any)?.nome ?? "—",
        especialidade: (ag.profissionais as any)?.especialidades?.nome,
      },
      unidade: {
        nome: (ag.unidades as any)?.nome ?? "—",
        endereco: (ag.unidades as any)?.endereco,
        telefone: (ag.unidades as any)?.telefone,
      },
      motivo: ag.motivo,
      emitidoPor: profile?.nome || user?.email || "",
    });
  };

  const fecharESair = () => {
    setComprovanteOpen(false);
    navigate({ to: "/app/agenda-dia", search: { data } as any });
  };


  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">1. Selecionar horário</CardTitle>
          <CardDescription>Escolha unidade, especialidade, profissional e data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Unidade</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {(unidadesAllowed ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Especialidade</Label>
              <Select value={especialidadeId} onValueChange={setEspecialidadeId}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {especs?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Profissional</Label>
              <Select value={profId} onValueChange={setProfId} disabled={!unidadeId}>
                <SelectTrigger><SelectValue placeholder={!unidadeId ? "Escolha a unidade" : "Selecionar"} /></SelectTrigger>
                <SelectContent>
                  {profs?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Vagas livres</div>
            {!profId ? (
              <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                <CalIcon className="mx-auto mb-2 h-6 w-6" /> Selecione um profissional para ver as vagas
              </div>
            ) : !slots || slots.length === 0 ? (
              <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                Sem vagas livres nesta data/unidade.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {slots.map((s: any) => (
                  <button key={s.id} type="button" onClick={() => setSlot(s)}
                    className={`min-h-11 rounded-md border px-3 py-2 text-sm transition ${
                      slot?.id === s.id ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                    }`}>{formatTime(s.hora_inicio)}</button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Paciente</CardTitle>
          <CardDescription>Busque por nome, CPF ou CNS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar paciente..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {paciente ? (
            <div className="rounded-md border bg-accent/40 p-3">
              <div className="text-sm font-medium">{paciente.nome}</div>
              <div className="text-xs text-muted-foreground">
                {paciente.cpf ? `CPF ${formatCPF(paciente.cpf)}` : ""} {paciente.cns ? ` · CNS ${formatCNS(paciente.cns)}` : ""}
              </div>
              <Button variant="link" size="sm" className="px-0 h-auto" onClick={() => setPaciente(null)}>Trocar paciente</Button>
            </div>
          ) : pacResults && pacResults.length > 0 ? (
            <ul className="rounded-md border divide-y max-h-60 overflow-y-auto">
              {pacResults.map((p: any) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setPaciente(p)} className="w-full text-left px-3 py-2 hover:bg-accent">
                    <div className="text-sm font-medium">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">{p.cpf ? formatCPF(p.cpf) : ""}</div>
                  </button>
                </li>
              ))}
            </ul>
          ) : search.length >= 2 ? (
            <div className="text-xs text-muted-foreground py-2">Nenhum paciente encontrado. <a href="/app/pacientes" className="text-primary hover:underline">Cadastrar novo</a></div>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs">Motivo / queixa</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional" />
          </div>

          <Button className="w-full" disabled={!canConfirm || submitting} onClick={handleAgendar}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Confirmar agendamento
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={comprovanteOpen} onOpenChange={setComprovanteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" /> Agendamento criado com sucesso
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja imprimir o comprovante do agendamento agora?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={fecharESair}>Não, obrigado</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { await imprimirComprovante(); fecharESair(); }}>
              <FileText className="mr-2 h-4 w-4" /> Sim, imprimir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
