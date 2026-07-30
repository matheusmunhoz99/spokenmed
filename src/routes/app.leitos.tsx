import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  Clock,
  Clock3,
  Eye,
  FileText,
  Filter,
  HeartPulse,
  Hospital,
  LayoutGrid,
  ListFilter,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Stethoscope,
  Trash2,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { SemAcesso } from "@/components/sem-acesso";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

function Guard() {
  const { can } = useAuth();
  if (!can("leitos")) return <SemAcesso />;
  return <LeitosPage />;
}

export const Route = createFileRoute("/app/leitos")({ component: Guard });

const SITUACAO_LABEL: Record<string, { label: string; className: string }> = {
  livre: { label: "Livre", className: "bg-emerald-500 text-white" },
  ocupado: { label: "Ocupado", className: "bg-red-600 text-white" },
  higienizacao: { label: "Higienização", className: "bg-amber-500 text-white" },
  bloqueado: { label: "Bloqueado", className: "bg-slate-500 text-white" },
  manutencao: { label: "Manutenção", className: "bg-slate-700 text-white" },
};

const STATUS_LABEL: Record<string, { label: string; variant: any }> = {
  pendente: { label: "Aguardando aprovação", variant: "outline" },
  aprovada: { label: "Internado", variant: "default" },
  recusada: { label: "Recusada", variant: "destructive" },
  alta: { label: "Alta", variant: "secondary" },
  cancelada: { label: "Cancelada", variant: "secondary" },
};

const TIPOS = [
  "clinico",
  "cirurgico",
  "uti",
  "pediatrico",
  "obstetrico",
  "isolamento",
  "observacao",
];

function diasInternado(dataAdmissao: string | null, dataAlta: string | null) {
  if (!dataAdmissao) return 0;
  const fim = dataAlta ? new Date(dataAlta) : new Date();
  return Math.max(0, Math.floor((fim.getTime() - new Date(dataAdmissao).getTime()) / 86400000));
}

function alertaPermanencia(dias: number) {
  if (dias >= 15)
    return {
      nivel: "critico",
      texto: `${dias} dias internado — permanência crítica`,
      className: "bg-red-600 text-white",
    };
  if (dias >= 7)
    return {
      nivel: "alto",
      texto: `${dias} dias internado — revisar com a regulação`,
      className: "bg-orange-500 text-white",
    };
  if (dias >= 3)
    return {
      nivel: "atencao",
      texto: `${dias} dias internado — atenção`,
      className: "bg-amber-400 text-black",
    };
  return null;
}

function LeitosPage() {
  const qc = useQueryClient();
  const { user, can } = useAuth();
  const podeGerenciar = can("leitos", "manage");
  const { data: unidades } = useAllowedUnidades();
  const [unidadeId, setUnidadeId] = useState<string>("");
  const hospitalId = unidadeId || (unidades?.[0]?.id ?? "");

  // Módulo Principal: "observacao" (Pronto Atendimento) vs "internacao" (Hospital)
  const [moduloAtivo, setModuloAtivo] = useState<"observacao" | "internacao">("observacao");

  // Modo de visualização de observação: "tabela" (inspirado no legado) vs "grid" (cards)
  const [visualizacaoObs, setVisualizacaoObs] = useState<"tabela" | "grid">("tabela");

  // Filtros da Observação
  const [buscaObs, setBuscaObs] = useState("");
  const [filtroStatusObs, setFiltroStatusObs] = useState<string>("todos");

  // Timer de contagem regressiva da próxima sincronização do .exe (30s)
  const [segundosParaSync, setSegundosParaSync] = useState(30);

  useEffect(() => {
    const timer = setInterval(() => {
      setSegundosParaSync((prev) => {
        if (prev <= 1) {
          refresh();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Inscrição Supabase Realtime via WebSockets (Atualização instantânea < 100ms)
  useEffect(() => {
    const channel = supabase
      .channel("realtime-observacoes-leitos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "observacoes" },
        () => {
          qc.invalidateQueries({ queryKey: ["observacoes"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "observacao_evolucoes" },
        () => {
          qc.invalidateQueries({ queryKey: ["observacao-evolucoes"] });
          qc.invalidateQueries({ queryKey: ["observacoes"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internacoes" },
        () => {
          qc.invalidateQueries({ queryKey: ["internacoes"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leitos" },
        () => {
          qc.invalidateQueries({ queryKey: ["leitos"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const [leitoOpen, setLeitoOpen] = useState(false);
  const [internacaoOpen, setInternacaoOpen] = useState(false);
  const [altaAlvo, setAltaAlvo] = useState<any>(null);
  const [recusaAlvo, setRecusaAlvo] = useState<any>(null);
  const [internacaoDetalhe, setInternacaoDetalhe] = useState<any>(null);
  const [observacaoDetalhe, setObservacaoDetalhe] = useState<any>(null);
  const [buscaPaciente, setBuscaPaciente] = useState("");

  const [formLeito, setFormLeito] = useState({
    ala: "",
    quarto: "",
    numero: "",
    tipo: "clinico",
    situacao: "livre",
    observacoes: "",
  });
  const [formInt, setFormInt] = useState({
    paciente_id: "",
    leito_id: "",
    motivo: "",
    cid10: "",
    prioridade: "normal",
    previsao_dias: "",
    observacoes: "",
  });
  const [altaMotivo, setAltaMotivo] = useState("");
  const [recusaMotivo, setRecusaMotivo] = useState("");

  const { data: leitos, isLoading: loadingLeitos } = useQuery({
    queryKey: ["leitos", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leitos")
        .select("*")
        .eq("unidade_id", hospitalId)
        .eq("ativo", true)
        .order("quarto")
        .order("numero");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: internacoes, isLoading: loadingInt } = useQuery({
    queryKey: ["internacoes", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internacoes")
        .select(
          "*, pacientes(id, nome, cpf, data_nascimento), leitos(id, quarto, numero, ala), medico_responsavel:profissionais!internacoes_medico_responsavel_id_fkey(id, nome)",
        )
        .eq("unidade_id", hospitalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: evolucoes, isLoading: loadingEvolucoes } = useQuery({
    queryKey: ["internacao-evolucoes", internacaoDetalhe?.id],
    enabled: !!internacaoDetalhe?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("internacao_evolucoes")
        .select("*, profissionais(id, nome)")
        .eq("internacao_id", internacaoDetalhe.id)
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: observacoes, isLoading: loadingObservacoes } = useQuery({
    queryKey: ["observacoes", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("observacoes")
        .select(
          "*, pacientes(id, nome, cpf, cns, data_nascimento), leitos(id, quarto, numero, ala), medico:profissionais!observacoes_medico_id_fkey(id, nome)",
        )
        .eq("unidade_id", hospitalId)
        .order("data_entrada", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: obsEvolucoes, isLoading: loadingObsEvolucoes } = useQuery({
    queryKey: ["observacao-evolucoes", observacaoDetalhe?.id],
    enabled: !!observacaoDetalhe?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("observacao_evolucoes")
        .select("*, profissionais(id, nome)")
        .eq("observacao_id", observacaoDetalhe.id)
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: pacientes } = useQuery({
    queryKey: ["pacientes-internacao", buscaPaciente],
    enabled: internacaoOpen,
    queryFn: async () => {
      let q = supabase
        .from("pacientes")
        .select("id, nome, cpf")
        .eq("ativo", true)
        .order("nome")
        .limit(30);
      if (buscaPaciente.trim().length >= 2) q = q.ilike("nome", `%${buscaPaciente.trim()}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  const ativas = (internacoes ?? []).filter((i: any) => i.status === "aprovada");
  const pendentes = (internacoes ?? []).filter((i: any) => i.status === "pendente");
  const encerradas = (internacoes ?? []).filter((i: any) =>
    ["alta", "recusada", "cancelada"].includes(i.status),
  );

  const observacoesFiltradas = useMemo(() => {
    return (observacoes ?? []).filter((o: any) => {
      if (filtroStatusObs === "ativas" && o.status === "alta") return false;
      if (filtroStatusObs === "reavaliacao" && o.status !== "reavaliacao") return false;
      if (filtroStatusObs === "alta" && o.status !== "alta") return false;

      if (!buscaObs.trim()) return true;
      const b = buscaObs.trim().toLowerCase();
      const nome = o.pacientes?.nome?.toLowerCase() ?? "";
      const ficha = o.ficha_firebird?.toLowerCase() ?? "";
      const medico = o.medico?.nome?.toLowerCase() ?? "";
      const cpf = o.pacientes?.cpf?.toLowerCase() ?? "";
      return nome.includes(b) || ficha.includes(b) || medico.includes(b) || cpf.includes(b);
    });
  }, [observacoes, filtroStatusObs, buscaObs]);

  const observacoesAtivas = (observacoes ?? []).filter((o: any) => o.status !== "alta");
  const observacoesReavaliacao = (observacoes ?? []).filter((o: any) => o.status === "reavaliacao");

  const internacaoPorLeito = useMemo(() => {
    const map: Record<string, any> = {};
    ativas.forEach((i: any) => {
      if (i.leito_id) map[i.leito_id] = i;
    });
    return map;
  }, [internacoes]);

  const leitosLivres = (leitos ?? []).filter((l: any) => l.situacao === "livre");
  const alertas = ativas
    .map((i: any) => ({ i, a: alertaPermanencia(diasInternado(i.data_admissao, null)) }))
    .filter((x) => x.a)
    .sort(
      (a, b) => diasInternado(b.i.data_admissao, null) - diasInternado(a.i.data_admissao, null),
    );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["leitos", hospitalId] });
    qc.invalidateQueries({ queryKey: ["internacoes", hospitalId] });
    qc.invalidateQueries({ queryKey: ["observacoes", hospitalId] });
  };

  async function salvarLeito() {
    if (!formLeito.quarto.trim() || !formLeito.numero.trim())
      return toast.error("Informe quarto e número do leito.");
    const { error } = await supabase.from("leitos").insert({
      unidade_id: hospitalId,
      ala: formLeito.ala.trim() || null,
      quarto: formLeito.quarto.trim(),
      numero: formLeito.numero.trim(),
      tipo: formLeito.tipo,
      situacao: formLeito.situacao as any,
      observacoes: formLeito.observacoes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Leito cadastrado.");
    setLeitoOpen(false);
    setFormLeito({
      ala: "",
      quarto: "",
      numero: "",
      tipo: "clinico",
      situacao: "livre",
      observacoes: "",
    });
    refresh();
  }

  async function mudarSituacao(id: string, situacao: string) {
    const { error } = await supabase
      .from("leitos")
      .update({ situacao: situacao as any })
      .eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function solicitarInternacao() {
    if (!formInt.paciente_id) return toast.error("Selecione o paciente.");
    if (!formInt.motivo.trim()) return toast.error("Informe o motivo da internação.");
    const { error } = await supabase.from("internacoes").insert({
      paciente_id: formInt.paciente_id,
      unidade_id: hospitalId,
      leito_id: formInt.leito_id || null,
      motivo: formInt.motivo.trim(),
      cid10: formInt.cid10.trim() || null,
      prioridade: formInt.prioridade,
      previsao_dias: formInt.previsao_dias ? Number(formInt.previsao_dias) : null,
      observacoes: formInt.observacoes.trim() || null,
      solicitado_por: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Solicitação de internação registrada.");
    setInternacaoOpen(false);
    setFormInt({
      paciente_id: "",
      leito_id: "",
      motivo: "",
      cid10: "",
      prioridade: "normal",
      previsao_dias: "",
      observacoes: "",
    });
    refresh();
  }

  async function aprovar(internacao: any, leitoId?: string) {
    const leito = leitoId ?? internacao.leito_id;
    if (!leito) return toast.error("Defina o leito antes de aprovar a internação.");
    const { error } = await supabase
      .from("internacoes")
      .update({
        status: "aprovada",
        leito_id: leito,
        aprovado_por: user?.id ?? null,
        aprovado_em: new Date().toISOString(),
        data_admissao: internacao.data_admissao ?? new Date().toISOString(),
      })
      .eq("id", internacao.id);
    if (error) return toast.error(error.message);
    toast.success("Internação aprovada.");
    refresh();
  }

  async function confirmarAlta() {
    const { error } = await supabase
      .from("internacoes")
      .update({
        status: "alta",
        data_alta: new Date().toISOString(),
        alta_motivo: altaMotivo.trim() || null,
      })
      .eq("id", altaAlvo.id);
    if (error) return toast.error(error.message);
    toast.success("Alta registrada. Leito enviado para higienização.");
    setAltaAlvo(null);
    setAltaMotivo("");
    refresh();
  }

  async function confirmarRecusa() {
    if (!recusaMotivo.trim()) return toast.error("Informe o motivo da recusa.");
    const { error } = await supabase
      .from("internacoes")
      .update({
        status: "recusada",
        recusa_motivo: recusaMotivo.trim(),
        aprovado_por: user?.id ?? null,
        aprovado_em: new Date().toISOString(),
      })
      .eq("id", recusaAlvo.id);
    if (error) return toast.error(error.message);
    toast.success("Solicitação recusada.");
    setRecusaAlvo(null);
    setRecusaMotivo("");
    refresh();
  }

  const contagem = {
    total: leitos?.length ?? 0,
    livres: leitosLivres.length,
    ocupados: (leitos ?? []).filter((l: any) => l.situacao === "ocupado").length,
    outros: (leitos ?? []).filter((l: any) => !["livre", "ocupado"].includes(l.situacao)).length,
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho Principal com Seletor de Módulo e Glassmorphism */}
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-6 p-7">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
              <Activity className="h-4 w-4 text-cyan-400" /> Central Médica de Atendimento
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              {moduloAtivo === "observacao" ? "Painel de Observação & Pronto Atendimento" : "Central Hospitalar & Mapa de Leitos"}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
              {moduloAtivo === "observacao"
                ? "Acompanhe em tempo real os pacientes em observação ambulatorial, evoluções médicas, anotações de enfermagem e reavaliações."
                : "Gestão inteligente de leitos hospitalares, internações ativas, regulação de vagas e mapa de ocupação por ala."}
            </p>
          </div>

          <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
            {/* Navegação entre Módulos de Alta Performance */}
            <div className="flex items-center rounded-2xl bg-white/10 p-1.5 backdrop-blur-md border border-white/15 shadow-inner">
              <button
                onClick={() => setModuloAtivo("observacao")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-300 ${
                  moduloAtivo === "observacao"
                    ? "bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/30 scale-[1.02]"
                    : "text-slate-300 hover:text-white hover:bg-white/5"
                }`}
              >
                <Stethoscope className="h-4 w-4" /> Observação ({observacoesAtivas.length})
              </button>
              <button
                onClick={() => setModuloAtivo("internacao")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-300 ${
                  moduloAtivo === "internacao"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-[1.02]"
                    : "text-slate-300 hover:text-white hover:bg-white/5"
                }`}
              >
                <Hospital className="h-4 w-4" /> Internações ({ativas.length})
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-mono font-bold text-cyan-300 shadow-md backdrop-blur-md">
              <span className="h-2.5 w-2.5 animate-ping rounded-full bg-cyan-400" />
              <span>Próxima sincronização em: 00:{segundosParaSync.toString().padStart(2, "0")}</span>
            </div>
          </div>
        </div>

        {/* Barra Inferior com Seletor de Unidade e Ações Globais */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-black/20 px-7 py-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Label className="text-xs font-semibold text-slate-300">Hospital / Unidade:</Label>
            <Select value={hospitalId} onValueChange={setUnidadeId}>
              <SelectTrigger className="w-[300px] border-white/15 bg-white/10 text-white text-xs font-medium shadow-sm hover:bg-white/15">
                <SelectValue placeholder="Selecione a unidade" />
              </SelectTrigger>
              <SelectContent>
                {(unidades ?? []).map((u: any) => (
                  <SelectItem key={u.id} value={u.id} className="text-xs">
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={!hospitalId}
              className="border-white/15 bg-white/10 text-white hover:bg-white/20 text-xs font-semibold"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar Dados
            </Button>

            {moduloAtivo === "internacao" && podeGerenciar && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setLeitoOpen(true)}
                  disabled={!hospitalId}
                  className="text-xs font-semibold"
                >
                  <BedDouble className="mr-2 h-3.5 w-3.5" /> Cadastrar Leito
                </Button>
                <Button
                  size="sm"
                  onClick={() => setInternacaoOpen(true)}
                  disabled={!hospitalId}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30"
                >
                  <Plus className="mr-2 h-3.5 w-3.5" /> Nova Internação
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONTEÚDO DO MÓDULO 1: PAINEL DE OBSERVAÇÃO (PRONTO ATENDIMENTO)             */}
      {/* ========================================================================= */}
      {moduloAtivo === "observacao" && (
        <div className="space-y-6">
          {/* KPI Cards de Observação */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-0 shadow-sm ring-1 ring-border/60 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl bg-amber-500/15 p-3.5 text-amber-600 dark:text-amber-400">
                  <Stethoscope className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-3xl font-extrabold tracking-tight text-amber-950 dark:text-amber-100">
                    {observacoesAtivas.length}
                  </div>
                  <div className="text-xs font-medium text-amber-900/70 dark:text-amber-300">
                    Em Observação Ativa
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm ring-1 ring-border/60 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl bg-orange-500/15 p-3.5 text-orange-600 dark:text-orange-400">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-3xl font-extrabold tracking-tight text-orange-950 dark:text-orange-100">
                    {observacoesReavaliacao.length}
                  </div>
                  <div className="text-xs font-medium text-orange-900/70 dark:text-orange-300">
                    Aguardando Reavaliação
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm ring-1 ring-border/60 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl bg-blue-500/15 p-3.5 text-blue-600 dark:text-blue-400">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-3xl font-extrabold tracking-tight text-blue-950 dark:text-blue-100">
                    {(observacoes ?? []).reduce((acc: number, o: any) => acc + (o.qtd_evolucoes || 0), 0)}
                  </div>
                  <div className="text-xs font-medium text-blue-900/70 dark:text-blue-300">
                    Evoluções Registradas
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm ring-1 ring-border/60 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl bg-emerald-500/15 p-3.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-3xl font-extrabold tracking-tight text-emerald-950 dark:text-emerald-100">
                    {(observacoes ?? []).filter((o: any) => o.status === "alta").length}
                  </div>
                  <div className="text-xs font-medium text-emerald-900/70 dark:text-emerald-300">
                    Altas de Observação (30d)
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Barra de Busca, Filtros e Alternador de Legado/Cards */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[240px] flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={buscaObs}
                  onChange={(e) => setBuscaObs(e.target.value)}
                  placeholder="Buscar por Paciente, Ficha, Médico ou CPF..."
                  className="pl-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5 rounded-xl border bg-muted/50 p-1">
                {[
                  ["todos", "Todos"],
                  ["ativas", "Em Atendimento"],
                  ["reavaliacao", "Reavaliação"],
                  ["alta", "Altas Recentes"],
                ].map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => setFiltroStatusObs(val)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      filtroStatusObs === val
                        ? "bg-background text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Alternador de Estilo: Tabela Clínica Ultramoderna vs Cards Luxuosos */}
            <div className="flex items-center rounded-xl border bg-muted/60 p-1">
              <button
                onClick={() => setVisualizacaoObs("tabela")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  visualizacaoObs === "tabela"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListFilter className="h-4 w-4" /> Tabela Clínica
              </button>
              <button
                onClick={() => setVisualizacaoObs("grid")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  visualizacaoObs === "grid"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-4 w-4" /> Grid Prontuário
              </button>
            </div>
          </div>

          {/* Legenda de Cores do Atendimento */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Legenda do Monitor:</span>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-amber-400 border border-amber-600 shadow-sm" />
              <span>Aguardando Reavaliação</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500 border border-emerald-600 shadow-sm" />
              <span>Em Observação Estável</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-slate-400 border border-slate-500 shadow-sm" />
              <span>Alta Concluída</span>
            </div>
          </div>

          {/* CONTEÚDO 1A: TABELA CLÍNICA ULTRAMODERNA (Inspirada na tela clássica, porém moderna e legível) */}
          {visualizacaoObs === "tabela" && (
            <Card className="border border-border/80 shadow-md overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-950 text-white dark:bg-slate-900">
                    <TableRow className="hover:bg-slate-900/80 border-b-slate-800">
                      <TableHead className="w-[110px] text-xs font-bold text-amber-300 uppercase tracking-wider">Ficha</TableHead>
                      <TableHead className="w-[150px] text-xs font-bold text-slate-200 uppercase tracking-wider">Entrada</TableHead>
                      <TableHead className="w-[120px] text-xs font-bold text-slate-200 uppercase tracking-wider">Status / Risco</TableHead>
                      <TableHead className="w-[130px] text-xs font-bold text-slate-200 uppercase tracking-wider">Leito / Setor</TableHead>
                      <TableHead className="text-xs font-bold text-slate-200 uppercase tracking-wider">Paciente</TableHead>
                      <TableHead className="w-[110px] text-xs font-bold text-slate-200 uppercase tracking-wider">Matrícula</TableHead>
                      <TableHead className="text-xs font-bold text-slate-200 uppercase tracking-wider">Médico Assistente</TableHead>
                      <TableHead className="w-[100px] text-right text-xs font-bold text-slate-200 uppercase tracking-wider">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingObservacoes ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-40 text-center">
                          <LoadingState />
                        </TableCell>
                      </TableRow>
                    ) : observacoesFiltradas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-40 text-center">
                          <EmptyState
                            title="Nenhum atendimento encontrado"
                            description="Não há pacientes em observação com os filtros selecionados."
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      observacoesFiltradas.map((o: any) => {
                        const isReavaliacao = o.status === "reavaliacao";
                        const isAlta = o.status === "alta";
                        return (
                          <TableRow
                            key={o.id}
                            onClick={() => setObservacaoDetalhe(o)}
                            className={`cursor-pointer transition-all duration-200 font-medium text-xs ${
                              isReavaliacao
                                ? "bg-amber-100/70 hover:bg-amber-100 text-amber-950 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 dark:text-amber-100 border-l-4 border-l-amber-500"
                                : isAlta
                                  ? "bg-slate-100/70 hover:bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 dark:text-slate-400 border-l-4 border-l-slate-400"
                                  : "bg-emerald-50/50 hover:bg-emerald-100/70 text-emerald-950 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 dark:text-emerald-100 border-l-4 border-l-emerald-500"
                            }`}
                          >
                            <TableCell className="font-mono font-bold tracking-tight text-xs">
                              {o.ficha_firebird}
                            </TableCell>
                            <TableCell className="text-xs">
                              {o.data_entrada ? new Date(o.data_entrada).toLocaleString("pt-BR") : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge
                                  className={
                                    isReavaliacao
                                      ? "bg-amber-500 text-white shadow-xs"
                                      : isAlta
                                        ? "bg-slate-500 text-white"
                                        : "bg-emerald-600 text-white shadow-xs"
                                  }
                                >
                                  {isReavaliacao ? "Reavaliação" : isAlta ? "Alta" : "Em Observação"}
                                </Badge>
                                {o.risco && (
                                  <span className="text-[10px] font-semibold text-muted-foreground truncate">
                                    Risco: {o.risco}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-xs">
                              {o.leito_descricao || o.leitos?.numero
                                ? `${o.quarto ? `Q${o.quarto} · ` : ""}${o.leito_descricao ?? `L${o.leitos.numero}`}`
                                : o.setor || "Sem Leito"}
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-sm text-foreground">{o.pacientes?.nome}</div>
                              <div className="text-[11px] text-muted-foreground font-normal">
                                {o.pacientes?.cpf ? `CPF: ${o.pacientes.cpf}` : ""}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {o.pacientes?.codigo_origem_firebird || "—"}
                            </TableCell>
                            <TableCell className="font-semibold text-xs">
                              {o.medico?.nome ?? "Não informado"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setObservacaoDetalhe(o);
                                }}
                                className="h-8 w-8 p-0 rounded-full hover:bg-background/80"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* CONTEÚDO 1B: GRID DE CARDS LUXUOSOS (Prontuário rápido) */}
          {visualizacaoObs === "grid" && (
            <div>
              {loadingObservacoes ? (
                <LoadingState />
              ) : observacoesFiltradas.length === 0 ? (
                <EmptyState
                  title="Nenhum atendimento encontrado"
                  description="Não há pacientes em observação com os filtros selecionados."
                />
              ) : (
                <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                  {observacoesFiltradas.map((o: any) => (
                    <Card
                      key={o.id}
                      onClick={() => setObservacaoDetalhe(o)}
                      className="group cursor-pointer overflow-hidden border-0 shadow-sm ring-1 ring-border/70 transition-all duration-300 hover:shadow-xl hover:ring-amber-500/50"
                    >
                      <div
                        className={`h-1.5 ${
                          o.status === "reavaliacao"
                            ? "bg-amber-500"
                            : o.status === "alta"
                              ? "bg-slate-400"
                              : "bg-emerald-500"
                        }`}
                      />
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-bold text-foreground group-hover:text-amber-600 transition-colors">
                              {o.pacientes?.nome}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground font-mono">
                              Ficha {o.ficha_firebird} · Matrícula {o.pacientes?.codigo_origem_firebird || "—"}
                            </div>
                          </div>
                          <Badge
                            className={
                              o.status === "reavaliacao"
                                ? "bg-amber-500 text-white font-bold"
                                : o.status === "alta"
                                  ? "bg-slate-500 text-white"
                                  : "bg-emerald-600 text-white font-bold"
                            }
                          >
                            {o.status === "reavaliacao" ? "Reavaliação" : o.status === "alta" ? "Alta" : "Em Observação"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-muted/60 p-3">
                            <div className="text-[11px] text-muted-foreground font-medium">Entrada</div>
                            <div className="mt-1 font-semibold">
                              {o.data_entrada ? new Date(o.data_entrada).toLocaleString("pt-BR") : "—"}
                            </div>
                          </div>
                          <div className="rounded-xl bg-muted/60 p-3">
                            <div className="text-[11px] text-muted-foreground font-medium">Local / Setor</div>
                            <div className="mt-1 font-semibold truncate">
                              {o.leito_descricao || o.leitos?.numero
                                ? `${o.quarto ? `Q${o.quarto} · ` : ""}${o.leito_descricao ?? `Leito ${o.leitos.numero}`}`
                                : o.setor || "Sem Leito"}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center gap-2 text-muted-foreground font-medium">
                            <Stethoscope className="h-4 w-4 text-amber-500" />
                            <span>Dr(a). {o.medico?.nome ?? "Não informado"}</span>
                          </div>
                          {o.risco && (
                            <div className="flex items-center gap-2 text-xs font-semibold">
                              <span className="h-2 w-2 rounded-full bg-rose-500" />
                              <span>Classificação: {o.risco}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {o.qtd_evolucoes > 0 && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 border-blue-200">
                              📋 {o.qtd_evolucoes} evolução(ões)
                            </Badge>
                          )}
                          {o.qtd_anotacoes > 0 && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border-amber-200">
                              ✏️ {o.qtd_anotacoes} anotação(ões)
                            </Badge>
                          )}
                          {o.qtd_prescricoes > 0 && (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200">
                              💊 {o.qtd_prescricoes} prescrição(ões)
                            </Badge>
                          )}
                        </div>

                        <Button className="w-full font-semibold text-xs mt-2" variant="outline">
                          <Eye className="mr-2 h-4 w-4 text-amber-600" /> Abrir Prontuário Completo
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONTEÚDO DO MÓDULO 2: CENTRAL HOSPITALAR DE INTERNAÇÕES                   */}
      {/* ========================================================================= */}
      {moduloAtivo === "internacao" && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: "Leitos ativos",
                valor: contagem.total,
                icon: Hospital,
                cor: "text-blue-600",
                fundo: "bg-blue-50",
              },
              {
                label: "Leitos livres",
                valor: contagem.livres,
                icon: CheckCircle2,
                cor: "text-emerald-600",
                fundo: "bg-emerald-50",
              },
              {
                label: "Internados",
                valor: ativas.length,
                icon: BedDouble,
                cor: "text-violet-600",
                fundo: "bg-violet-50",
              },
              {
                label: "Em observação",
                valor: observacoesAtivas.length,
                icon: Stethoscope,
                cor: "text-amber-600",
                fundo: "bg-amber-50",
              },
              {
                label: "Aguardando leito",
                valor: ativas.filter((i: any) => !i.leito_id).length,
                icon: AlertTriangle,
                cor: "text-rose-600",
                fundo: "bg-rose-50",
              },
            ].map((c) => (
              <Card key={c.label} className="overflow-hidden border-0 shadow-sm ring-1 ring-border/70">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`rounded-xl p-2.5 ${c.fundo}`}>
                    <c.icon className={`h-5 w-5 ${c.cor}`} />
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{c.valor}</div>
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {alertas.length > 0 && (
            <Card className="border-amber-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas de permanência (
                  {alertas.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alertas.map(({ i, a }: any) => (
                  <div
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{i.pacientes?.nome}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · Leito {i.leitos?.quarto}/{i.leitos?.numero} · {i.motivo}
                      </span>
                    </div>
                    <Badge className={a.className}>{a.texto}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="mapa">
            <TabsList className="h-auto flex-wrap justify-start rounded-xl bg-muted/70 p-1">
              <TabsTrigger value="mapa">Mapa de leitos</TabsTrigger>
              <TabsTrigger value="pendentes">Aprovações ({pendentes.length})</TabsTrigger>
              <TabsTrigger value="internados">Internados ({ativas.length})</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="mapa" className="mt-4">
              {loadingLeitos ? (
                <LoadingState />
              ) : (leitos ?? []).length === 0 ? (
                <EmptyState
                  title="Nenhum leito cadastrado"
                  description="Cadastre os quartos e leitos deste hospital para começar o controle."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {(leitos ?? []).map((l: any) => {
                    const occ = internacaoPorLeito[l.id];
                    const dias = occ ? diasInternado(occ.data_admissao, null) : 0;
                    const alerta = occ ? alertaPermanencia(dias) : null;
                    const sit = SITUACAO_LABEL[l.situacao] ?? SITUACAO_LABEL.livre;
                    return (
                      <Card key={l.id}>
                        <CardContent className="space-y-2 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold">
                                Quarto {l.quarto} · Leito {l.numero}
                              </div>
                              <div className="text-xs capitalize text-muted-foreground">
                                {l.ala ? `${l.ala} · ` : ""}
                                {l.tipo}
                              </div>
                            </div>
                            <Badge className={sit.className}>{sit.label}</Badge>
                          </div>
                          {occ ? (
                            <div className="rounded-md bg-muted/50 p-2 text-sm">
                              <div className="font-medium">{occ.pacientes?.nome}</div>
                              <div className="text-xs text-muted-foreground">{occ.motivo}</div>
                              {occ.medico_responsavel?.nome && (
                                <div className="text-xs text-muted-foreground">
                                  Dr(a). {occ.medico_responsavel.nome}
                                </div>
                              )}
                              <div className="mt-1 flex items-center gap-2">
                                <Badge variant="outline">
                                  {dias} dia{dias === 1 ? "" : "s"}
                                </Badge>
                                {alerta && (
                                  <Badge className={alerta.className}>
                                    {alerta.nivel === "critico"
                                      ? "Crítico"
                                      : alerta.nivel === "alto"
                                        ? "7+ dias"
                                        : "3+ dias"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">Sem paciente alocado</div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pendentes" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead>Previsão</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendentes.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            Sem solicitações pendentes.
                          </TableCell>
                        </TableRow>
                      )}
                      {pendentes.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.pacientes?.nome}</TableCell>
                          <TableCell>{i.motivo}</TableCell>
                          <TableCell className="capitalize">{i.prioridade}</TableCell>
                          <TableCell>{i.previsao_dias ? `${i.previsao_dias} dias` : "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setRecusaAlvo(i)}
                              >
                                Recusar
                              </Button>
                              <Button size="sm" onClick={() => aprovar(i)}>
                                Aprovar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="internados" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Leito</TableHead>
                        <TableHead>Médico Responsável</TableHead>
                        <TableHead>Admissão</TableHead>
                        <TableHead>Permanência</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ativas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                            Nenhum paciente internado no momento.
                          </TableCell>
                        </TableRow>
                      )}
                      {ativas.map((i: any) => {
                        const dias = diasInternado(i.data_admissao, null);
                        return (
                          <TableRow key={i.id}>
                            <TableCell className="font-medium">{i.pacientes?.nome}</TableCell>
                            <TableCell>
                              {i.leitos ? `Quarto ${i.leitos.quarto} · L${i.leitos.numero}` : "Sem leito"}
                            </TableCell>
                            <TableCell>{i.medico_responsavel?.nome ?? "Não informado"}</TableCell>
                            <TableCell>
                              {i.data_admissao
                                ? new Date(i.data_admissao).toLocaleDateString("pt-BR")
                                : "—"}
                            </TableCell>
                            <TableCell>{dias} dias</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setInternacaoDetalhe(i)}
                                >
                                  Evoluções
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setAltaAlvo(i)}
                                >
                                  Registrar Alta
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Permanência</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {encerradas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            Sem registros encerrados.
                          </TableCell>
                        </TableRow>
                      )}
                      {encerradas.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.pacientes?.nome}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_LABEL[i.status]?.variant}>
                              {STATUS_LABEL[i.status]?.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate">
                            {i.status === "recusada" ? i.recusa_motivo : i.motivo}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {i.data_admissao
                              ? new Date(i.data_admissao).toLocaleDateString("pt-BR")
                              : "—"}
                            {i.data_alta
                              ? ` → ${new Date(i.data_alta).toLocaleDateString("pt-BR")}`
                              : ""}
                          </TableCell>
                          <TableCell>
                            {i.data_admissao
                              ? `${diasInternado(i.data_admissao, i.data_alta)} dias`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIÁLOGOS E MODAIS DE DETALHAMENTO DE PRONTUÁRIO                            */}
      {/* ========================================================================= */}

      {/* Modal de Detalhes do Atendimento de Observação com Prontuário Digital */}
      <Dialog
        open={!!observacaoDetalhe}
        onOpenChange={(open) => !open && setObservacaoDetalhe(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Stethoscope className="h-5 w-5 text-amber-500" /> Prontuário & Atendimento em Observação
            </DialogTitle>
          </DialogHeader>
          {observacaoDetalhe && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-amber-950/40 to-slate-900 p-5 text-white shadow-md border border-amber-500/20">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-bold tracking-tight">{observacaoDetalhe.pacientes?.nome}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-amber-200/80">
                      <span>Ficha: {observacaoDetalhe.ficha_firebird}</span>
                      {observacaoDetalhe.pacientes?.cpf && <span>• CPF: {observacaoDetalhe.pacientes.cpf}</span>}
                      {observacaoDetalhe.pacientes?.cns && <span>• CNS: {observacaoDetalhe.pacientes.cns}</span>}
                    </div>
                  </div>
                  <Badge
                    className={
                      observacaoDetalhe.status === "reavaliacao"
                        ? "bg-orange-500 text-white shadow-sm font-bold"
                        : "bg-amber-400 text-amber-950 font-bold shadow-sm"
                    }
                  >
                    {observacaoDetalhe.status === "reavaliacao"
                      ? "Aguardando Reavaliação"
                      : "Em Observação"}
                  </Badge>
                </div>
              </div>

              <Tabs defaultValue="evolucoes" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-muted/60 p-1 rounded-xl">
                  <TabsTrigger value="evolucoes" className="rounded-lg font-semibold text-xs">
                    📋 Evoluções & Anotações ({(obsEvolucoes ?? []).length})
                  </TabsTrigger>
                  <TabsTrigger value="resumo" className="rounded-lg font-semibold text-xs">
                    📊 Produção Clínica
                  </TabsTrigger>
                  <TabsTrigger value="ficha" className="rounded-lg font-semibold text-xs">
                    🩺 Ficha do Paciente
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="evolucoes" className="mt-4 space-y-4">
                  {loadingObsEvolucoes ? (
                    <LoadingState />
                  ) : (obsEvolucoes ?? []).length === 0 ? (
                    <EmptyState
                      title="Nenhuma evolução ou anotação registrada"
                      description="As evoluções médicas e anotações de enfermagem feitas no Firebird aparecerão automaticamente aqui em tempo real."
                    />
                  ) : (
                    <div className="relative space-y-3 pl-2 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
                      {(obsEvolucoes ?? []).map((e: any) => {
                        const isAnotacao = e.anotacao || e.flg_anotacao === "S";
                        return (
                          <Card
                            key={e.id}
                            className={`relative overflow-hidden border transition-all ${
                              isAnotacao
                                ? "border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10"
                                : "border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/10"
                            }`}
                          >
                            <CardContent className="space-y-3 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                                <div className="flex items-center gap-2">
                                  <div className={`rounded-full p-1.5 ${isAnotacao ? "bg-amber-500/10 text-amber-600" : "bg-blue-500/10 text-blue-600"}`}>
                                    <UserRound className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <div className="font-semibold text-sm">
                                      {e.profissionais?.nome || e.profissional_nome || "Profissional Responsável"}
                                    </div>
                                    {e.usuario && (
                                      <div className="text-xs text-muted-foreground">
                                        Usuário: {e.usuario}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={isAnotacao ? "secondary" : "default"} className={isAnotacao ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-blue-600 text-white"}>
                                    {isAnotacao ? "Anotação de Enfermagem" : "Evolução Médica"}
                                  </Badge>
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {e.data_hora
                                      ? new Date(e.data_hora).toLocaleString("pt-BR")
                                      : "—"}
                                  </span>
                                </div>
                              </div>
                              {e.evolucao && (
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                                  {e.evolucao}
                                </p>
                              )}

                              {/* Sinais Vitais da Evolução */}
                              {(e.pressao_sistolica != null || e.bpm != null || e.temperatura != null || e.saturacao != null || e.especialidade) && (
                                <div className="flex flex-wrap items-center gap-2 pt-2 border-t text-xs">
                                  {e.especialidade && (
                                    <Badge variant="outline" className="bg-indigo-50/50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
                                      🩺 {e.especialidade}
                                    </Badge>
                                  )}
                                  {e.pressao_sistolica != null && (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 font-mono">
                                      🩺 PA: {e.pressao_sistolica}/{e.pressao_diastolica ?? "—"} mmHg
                                    </Badge>
                                  )}
                                  {e.bpm != null && (
                                    <Badge variant="outline" className="bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 font-mono">
                                      ❤️ FC: {e.bpm} bpm
                                    </Badge>
                                  )}
                                  {e.temperatura != null && (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 font-mono">
                                      🌡️ Temp: {e.temperatura} °C
                                    </Badge>
                                  )}
                                  {e.saturacao != null && (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 font-mono">
                                      🫁 SpO₂: {e.saturacao}%
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="resumo" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ["Evoluções", observacaoDetalhe.qtd_evolucoes, "text-blue-600"],
                      ["Anotações", observacaoDetalhe.qtd_anotacoes, "text-amber-600"],
                      ["Prescrições", observacaoDetalhe.qtd_prescricoes, "text-emerald-600"],
                      ["Medicações Pendentes", observacaoDetalhe.qtd_medicacoes_pendentes, "text-rose-600"],
                      ["Orientações", observacaoDetalhe.qtd_orientacoes, "text-purple-600"],
                      ["Receitas", observacaoDetalhe.qtd_receitas, "text-indigo-600"],
                      ["Atestados", observacaoDetalhe.qtd_atestados, "text-cyan-600"],
                      ["Procedimentos", observacaoDetalhe.qtd_procedimentos, "text-teal-600"],
                    ].map(([label, value, colorClass]) => (
                      <Card key={String(label)} className="border-0 shadow-sm ring-1 ring-border/60">
                        <CardContent className="p-4 text-center">
                          <div className={`text-2xl font-bold ${colorClass}`}>
                            {Number(value ?? 0)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="ficha" className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      ["Data Entrada", observacaoDetalhe.data_entrada ? new Date(observacaoDetalhe.data_entrada).toLocaleString("pt-BR") : "Não informada"],
                      ["Data Alta", observacaoDetalhe.data_alta ? new Date(observacaoDetalhe.data_alta).toLocaleString("pt-BR") : "Paciente em atendimento"],
                      ["Médico Assistente", observacaoDetalhe.medico?.nome ?? "Não informado"],
                      ["Setor", observacaoDetalhe.setor ?? "Não informado"],
                      ["Quarto / Leito", [observacaoDetalhe.quarto, observacaoDetalhe.leito_descricao].filter(Boolean).join(" · ") || "Não vinculado"],
                      ["Convênio", observacaoDetalhe.convenio ?? "Não informado"],
                      ["Classificação de Risco", observacaoDetalhe.risco ?? "Não informada"],
                      ["Tipo Ficha", observacaoDetalhe.tipo_ficha ?? "Observação Ambulatorial"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border bg-card p-3.5 shadow-sm">
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="mt-1 text-sm font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-emerald-500 animate-spin" /> Sincronizado automaticamente com o Firebird
                </span>
                <span>
                  Última atualização:{" "}
                  {observacaoDetalhe.payload_atualizado_em
                    ? new Date(observacaoDetalhe.payload_atualizado_em).toLocaleString("pt-BR")
                    : "agora"}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Evoluções de Internação */}
      <Dialog
        open={!!internacaoDetalhe}
        onOpenChange={(open) => !open && setInternacaoDetalhe(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Evoluções da internação
            </DialogTitle>
          </DialogHeader>
          {internacaoDetalhe && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-semibold">{internacaoDetalhe.pacientes?.nome}</div>
              <div className="text-muted-foreground">
                {internacaoDetalhe.leitos
                  ? `Quarto ${internacaoDetalhe.leitos.quarto} · Leito ${internacaoDetalhe.leitos.numero}`
                  : "Sem leito"}
                {internacaoDetalhe.medico_responsavel?.nome
                  ? ` · Dr(a). ${internacaoDetalhe.medico_responsavel.nome}`
                  : ""}
              </div>
            </div>
          )}
          {loadingEvolucoes ? (
            <LoadingState />
          ) : (evolucoes ?? []).length === 0 ? (
            <EmptyState
              title="Sem evoluções"
              description="Ainda não há evoluções sincronizadas para esta internação."
            />
          ) : (
            <div className="space-y-3">
              {(evolucoes ?? []).map((e: any) => (
                <Card key={e.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">
                        {e.profissionais?.nome ?? "Profissional não informado"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.data_hora
                          ? new Date(e.data_hora).toLocaleString("pt-BR")
                          : "Data não informada"}
                      </div>
                    </div>
                    {e.situacao && <Badge variant="outline">{e.situacao}</Badge>}
                    {e.evolucao && <p className="whitespace-pre-wrap text-sm">{e.evolucao}</p>}
                    {e.prescricao && (
                      <div className="rounded-md bg-muted/50 p-2 text-sm">
                        <span className="font-medium">Prescrição: </span>
                        {e.prescricao}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {e.pressao_sistolica != null && (
                        <span>
                          PA {e.pressao_sistolica}/{e.pressao_diastolica ?? "—"}
                        </span>
                      )}
                      {e.bpm != null && <span>FC {e.bpm} bpm</span>}
                      {e.temperatura != null && <span>Temp. {e.temperatura} °C</span>}
                      {e.saturacao != null && <span>SpO₂ {e.saturacao}%</span>}
                      {e.glicemia != null && <span>Glicemia {e.glicemia}</span>}
                      {e.peso != null && <span>Peso {e.peso} kg</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Novo leito */}
      <Dialog open={leitoOpen} onOpenChange={setLeitoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo leito</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Ala</Label>
              <Input
                value={formLeito.ala}
                onChange={(e) => setFormLeito({ ...formLeito, ala: e.target.value })}
                placeholder="Ala A"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={formLeito.tipo}
                onValueChange={(v) => setFormLeito({ ...formLeito, tipo: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quarto *</Label>
              <Input
                value={formLeito.quarto}
                onChange={(e) => setFormLeito({ ...formLeito, quarto: e.target.value })}
                placeholder="101"
              />
            </div>
            <div>
              <Label>Leito *</Label>
              <Input
                value={formLeito.numero}
                onChange={(e) => setFormLeito({ ...formLeito, numero: e.target.value })}
                placeholder="A"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={formLeito.observacoes}
                onChange={(e) => setFormLeito({ ...formLeito, observacoes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeitoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarLeito}>Salvar leito</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nova internação */}
      <Dialog open={internacaoOpen} onOpenChange={setInternacaoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Solicitar internação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Buscar paciente</Label>
              <Input
                value={buscaPaciente}
                onChange={(e) => setBuscaPaciente(e.target.value)}
                placeholder="Digite o nome..."
              />
            </div>
            <div>
              <Label>Paciente *</Label>
              <Select
                value={formInt.paciente_id}
                onValueChange={(v) => setFormInt({ ...formInt, paciente_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(pacientes ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Leito (opcional)</Label>
                <Select
                  value={formInt.leito_id}
                  onValueChange={(v) => setFormInt({ ...formInt, leito_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Definir na aprovação" />
                  </SelectTrigger>
                  <SelectContent>
                    {leitosLivres.map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>
                        Q{l.quarto} · L{l.numero}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select
                  value={formInt.prioridade}
                  onValueChange={(v) => setFormInt({ ...formInt, prioridade: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="prioritaria">Prioritária</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CID-10</Label>
                <Input
                  value={formInt.cid10}
                  onChange={(e) => setFormInt({ ...formInt, cid10: e.target.value })}
                />
              </div>
              <div>
                <Label>Previsão (dias)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formInt.previsao_dias}
                  onChange={(e) => setFormInt({ ...formInt, previsao_dias: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Motivo da internação *</Label>
              <Textarea
                value={formInt.motivo}
                onChange={(e) => setFormInt({ ...formInt, motivo: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={formInt.observacoes}
                onChange={(e) => setFormInt({ ...formInt, observacoes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInternacaoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={solicitarInternacao}>Registrar solicitação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alta */}
      <Dialog open={!!altaAlvo} onOpenChange={(open) => !open && setAltaAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar alta hospitalar</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirma a alta do paciente <strong>{altaAlvo?.pacientes?.nome}</strong>? O leito será
            liberado e enviado para higienização.
          </p>
          <div>
            <Label>Motivo / resumo da alta</Label>
            <Textarea
              value={altaMotivo}
              onChange={(e) => setAltaMotivo(e.target.value)}
              placeholder="Cura, transferência, alta a pedido..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAltaAlvo(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarAlta}>Confirmar alta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recusa */}
      <Dialog open={!!recusaAlvo} onOpenChange={(open) => !open && setRecusaAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar solicitação de internação</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Motivo da recusa *</Label>
            <Textarea
              value={recusaMotivo}
              onChange={(e) => setRecusaMotivo(e.target.value)}
              placeholder="Ausência de leito vago, indicação ambulatorial..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusaAlvo(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarRecusa}>
              Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
