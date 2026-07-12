import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
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
import { Loader2, Search, Check, Calendar as CalIcon, FileText, UserSearch, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { formatCPF, formatCNS, formatTime, onlyDigits } from "@/lib/format";
import { gerarComprovante } from "@/lib/pdf-comprovante";

import { SemAcesso } from "@/components/sem-acesso";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
function AgendarGuard() {
  const { can } = useAuth();
  if (!can("agendar")) return <SemAcesso />;
  return <AgendarPage />;
}
export const Route = createFileRoute("/app/agendar")({ component: AgendarGuard });

function AgendarPage() {
  const { user, profile, isAdmin, can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: unidadesAllowed } = useAllowedUnidades();
  const podeSecretaria = isAdmin || can("secretaria_agendar", "manage");

  const [unidadeId, setUnidadeId] = useState("");
  const [especialidadeId, setEspecialidadeId] = useState("");
  const [profId, setProfId] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [slot, setSlot] = useState<any>(null);
  const [paciente, setPaciente] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [motivo, setMotivo] = useState("");
  const [procedimentoId, setProcedimentoId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [comprovanteOpen, setComprovanteOpen] = useState(false);
  const [ultimoAgendamentoId, setUltimoAgendamentoId] = useState<string | null>(null);
  const [origemSecretaria, setOrigemSecretaria] = useState(false);

  const competencia = useMemo(() => `${data.slice(0, 7)}-01`, [data]);
  const { data: cotaInfo } = useQuery({
    queryKey: ["consumo-cota", unidadeId, especialidadeId, procedimentoId, competencia],
    enabled: !!unidadeId && (!!especialidadeId && especialidadeId !== "all" || !!procedimentoId),
    queryFn: async () => {
      const { data: rows } = await supabase.rpc("consumo_cota" as any, {
        _unidade_id: unidadeId,
        _especialidade_id: especialidadeId && especialidadeId !== "all" ? especialidadeId : null,
        _procedimento_id: procedimentoId || null,
        _competencia: competencia,
      });
      return (Array.isArray(rows) ? rows[0] : rows) ?? null;
    },
  });

  const { data: procedimentos } = useQuery({
    queryKey: ["procedimentos-ativos"],
    queryFn: async () => (await supabase.from("procedimentos").select("id, codigo_sigtap, nome").eq("ativo", true).order("codigo_sigtap")).data ?? [],
  });

  useEffect(() => {
    if (!unidadeId && unidadesAllowed && unidadesAllowed.length > 0) setUnidadeId(unidadesAllowed[0].id);
  }, [unidadesAllowed, unidadeId]);

  // Carrega TODOS os profissionais ativos da unidade (com especialidade).
  const { data: profsUnidade } = useQuery({
    queryKey: ["profs-da-unidade", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("profissional_unidades")
        .select("profissionais(id, nome, especialidade_id, ativo, especialidades(id, nome))")
        .eq("unidade_id", unidadeId);
      return (rows ?? [])
        .map((r: any) => r.profissionais)
        .filter((p: any) => p && p.ativo)
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
    },
  });

  // Especialidades disponíveis = distintas dos profissionais da unidade.
  const especs = useMemo(() => {
    const map = new Map<string, { id: string; nome: string }>();
    for (const p of profsUnidade ?? []) {
      if (p.especialidade_id && p.especialidades?.nome) {
        map.set(p.especialidade_id, { id: p.especialidade_id, nome: p.especialidades.nome });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [profsUnidade]);

  // Profissionais filtrados pela especialidade (quando definida).
  const profs = useMemo(() => {
    if (!profsUnidade) return [];
    if (!especialidadeId || especialidadeId === "all") return profsUnidade;
    return profsUnidade.filter((p: any) => p.especialidade_id === especialidadeId);
  }, [profsUnidade, especialidadeId]);

  // Ao trocar unidade: limpa especialidade e profissional.
  useEffect(() => {
    setEspecialidadeId("");
    setProfId("");
    setSlot(null);
  }, [unidadeId]);

  // Ao trocar especialidade: se o profissional atual não pertence, limpa.
  useEffect(() => {
    if (!profId) return;
    if (!especialidadeId || especialidadeId === "all") return;
    const atual = profsUnidade?.find((p: any) => p.id === profId);
    if (atual && atual.especialidade_id !== especialidadeId) {
      setProfId("");
      setSlot(null);
    }
  }, [especialidadeId, profId, profsUnidade]);

  // Ao escolher profissional: auto-preenche a especialidade dele.
  useEffect(() => {
    if (!profId) return;
    const atual = profsUnidade?.find((p: any) => p.id === profId);
    if (atual?.especialidade_id && (!especialidadeId || especialidadeId === "all")) {
      setEspecialidadeId(atual.especialidade_id);
    }
  }, [profId, profsUnidade, especialidadeId]);

  useEffect(() => { setSlot(null); }, [profId, data]);

  const { data: slots, isLoading: slotsLoading } = useQuery({
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

  const { data: pacResults, isFetching: pacLoading } = useQuery({
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
    const { data: created, error: e2 } = await supabase.from("agendamentos").insert({
      slot_id: slot.id, paciente_id: paciente.id, profissional_id: profId, unidade_id: unidadeId,
      data, hora_inicio: slot.hora_inicio,
      motivo: motivo || null, criado_por: user?.id,
      procedimento_id: procedimentoId || null,
      origem_agenda: origemSecretaria ? "secretaria" : "ubs",
    } as any).select("id").single();
    setSubmitting(false);
    if (e2 || !created) {
      const msg = e2?.message ?? "";
      let friendly = "Erro ao agendar";
      if (msg.includes("slot_indisponivel")) friendly = "Esse horário acabou de ser reservado. Escolha outro.";
      else if (msg.includes("slot_incoerente")) friendly = "Horário inválido para os filtros selecionados.";
      else if (msg.includes("slot_inexistente")) friendly = "Horário não existe mais.";
      else if (msg.includes("cota_esgotada_ubs_esp")) friendly = "Cota da UBS para esta especialidade esgotada neste mês.";
      else if (msg.includes("cota_esgotada_secretaria_esp")) friendly = "Cota da Secretaria para esta especialidade esgotada neste mês.";
      else if (msg.includes("cota_esgotada_ubs_proc")) friendly = "Cota da UBS para este procedimento esgotada neste mês.";
      else if (msg.includes("cota_esgotada_secretaria_proc")) friendly = "Cota da Secretaria para este procedimento esgotada neste mês.";
      else if (msg.toLowerCase().includes("permission")) friendly = "Sem permissão para agendar nesta unidade.";
      else if (msg) friendly = msg;
      qc.invalidateQueries({ queryKey: ["slots-ag"] });
      qc.invalidateQueries({ queryKey: ["consumo-cota"] });
      return toast.error(friendly);
    }
    toast.success(origemSecretaria ? "Urgência agendada pela Secretaria!" : "Consulta agendada!");
    qc.invalidateQueries();
    setUltimoAgendamentoId(created.id);
    setComprovanteOpen(true);
  };

  const imprimirComprovante = async () => {
    if (!ultimoAgendamentoId) return;
    const { data: ag } = await supabase
      .from("agendamentos")
      .select("id, codigo, data, hora_inicio, motivo, pacientes(nome, cpf, cns, telefone), profissionais(nome, cbo, especialidades(nome)), unidades(nome, endereco, telefone, cnes), procedimentos(codigo_sigtap, nome)")
      .eq("id", ultimoAgendamentoId)
      .single();
    if (!ag) return toast.error("Não foi possível carregar o comprovante");
    await gerarComprovante({
      codigo: (ag as any).codigo ?? ag.id,
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
        cbo: (ag.profissionais as any)?.cbo,
      },
      unidade: {
        nome: (ag.unidades as any)?.nome ?? "—",
        endereco: (ag.unidades as any)?.endereco,
        telefone: (ag.unidades as any)?.telefone,
        cnes: (ag.unidades as any)?.cnes,
      },
      procedimento: (ag as any).procedimentos
        ? { codigo: (ag as any).procedimentos.codigo_sigtap, nome: (ag as any).procedimentos.nome }
        : null,
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
              <Select value={especialidadeId} onValueChange={setEspecialidadeId} disabled={!unidadeId || especs.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={!unidadeId ? "Escolha a unidade" : especs.length === 0 ? "Sem especialidades" : "Todas"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {especs.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Profissional</Label>
              <Select value={profId} onValueChange={setProfId} disabled={!unidadeId || profs.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={!unidadeId ? "Escolha a unidade" : profs.length === 0 ? "Nenhum profissional" : "Selecionar"} />
                </SelectTrigger>
                <SelectContent>
                  {profs.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}{p.especialidades?.nome ? ` · ${p.especialidades.nome}` : ""}
                    </SelectItem>
                  ))}
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
              <EmptyState
                icon={CalIcon}
                title="Selecione um profissional"
                description="Escolha unidade e profissional para visualizar as vagas livres da data."
                compact
              />
            ) : slotsLoading ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : !slots || slots.length === 0 ? (
              <EmptyState
                icon={CalIcon}
                title="Sem vagas livres"
                description="Não há horários disponíveis nesta data e unidade. Tente outra data ou crie um encaixe."
                compact
              />
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
          ) : search.length >= 2 && pacLoading ? (
            <LoadingState variant="list" rows={3} />
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
            <EmptyState
              icon={UserSearch}
              title="Nenhum paciente encontrado"
              description="Verifique a grafia do nome, ou cadastre um novo paciente."
              action={{ label: "Cadastrar novo", icon: UserPlus, onClick: () => navigate({ to: "/app/pacientes" }) }}
              compact
            />
          ) : (
            <EmptyState
              icon={Search}
              title="Busque um paciente"
              description="Digite ao menos 2 letras do nome ou 3 dígitos do CPF/CNS."
              compact
            />
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Procedimento SIGTAP</Label>
            <Select value={procedimentoId} onValueChange={setProcedimentoId}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                {(procedimentos ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.codigo_sigtap} · {p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Motivo / queixa</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional" />
          </div>

          {cotaInfo && cotaInfo.regime === "cota" && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Unidade sob cota mensal
              </div>
              {especialidadeId && especialidadeId !== "all" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Especialidade</span>
                  <div className="flex gap-1">
                    <Badge variant="outline">UBS {cotaInfo.esp_usadas_ubs ?? 0}/{cotaInfo.esp_totais ?? 0}</Badge>
                    <Badge variant="outline">Secretaria {cotaInfo.esp_usadas_sec ?? 0}/{cotaInfo.esp_secretaria ?? 0}</Badge>
                  </div>
                </div>
              )}
              {procedimentoId && (cotaInfo.proc_totais > 0 || cotaInfo.proc_secretaria > 0) && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Procedimento</span>
                  <div className="flex gap-1">
                    <Badge variant="outline">UBS {cotaInfo.proc_usadas_ubs ?? 0}/{cotaInfo.proc_totais ?? 0}</Badge>
                    <Badge variant="outline">Secretaria {cotaInfo.proc_usadas_sec ?? 0}/{cotaInfo.proc_secretaria ?? 0}</Badge>
                  </div>
                </div>
              )}
              {podeSecretaria && (
                <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                  <span className="font-medium">Agendar como Secretaria (urgência)</span>
                  <Switch checked={origemSecretaria} onCheckedChange={setOrigemSecretaria} />
                </label>
              )}
            </div>
          )}

          <Button className="w-full" disabled={!canConfirm || submitting} onClick={handleAgendar}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {origemSecretaria ? "Confirmar (Secretaria)" : "Confirmar agendamento"}
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
