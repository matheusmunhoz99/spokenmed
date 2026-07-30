import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Calendar, Clock, User, Stethoscope, ChevronLeft, ChevronRight, RefreshCw, CheckCircle2, AlertCircle, ShieldCheck, Zap } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatTime } from "@/lib/format";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";

function AgendasGuard() {
  const { can } = useAuth();
  if (!can("agendas")) return <SemAcesso />;
  return <AgendasPage />;
}

export const Route = createFileRoute("/app/agendas")({
  component: AgendasGuard,
  validateSearch: (s: Record<string, unknown>) => ({ profissional: (s.profissional as string) ?? "" }),
});

const diasSemanaHeader = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function AgendasPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [profId, setProfId] = useState<string>(search.profissional || "all");
  const [unidadeId, setUnidadeId] = useState<string>("all");
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dayModalOpen, setDayModalOpen] = useState(false);

  // Live 10s sync timer state
  const [segundosParaSync, setSegundosParaSync] = useState(10);
  const { data: unidadesAllowed } = useAllowedUnidades();

  useEffect(() => {
    const timer = setInterval(() => {
      setSegundosParaSync((prev) => {
        if (prev <= 1) {
          qc.invalidateQueries({ queryKey: ["agendamentos-calendario"] });
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [qc]);

  // Realtime WebSockets listener (<100ms update!)
  useEffect(() => {
    const channel = supabase
      .channel("realtime-agendas-matriz")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos" }, () => {
        qc.invalidateQueries({ queryKey: ["agendamentos-calendario"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agendas" }, () => {
        qc.invalidateQueries({ queryKey: ["agendamentos-calendario"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  // Lista de profissionais ativos
  const { data: profs } = useQuery({
    queryKey: ["profissionais-ativos-select"],
    queryFn: async () => (await supabase.from("profissionais")
      .select("id, nome, especialidades(nome), profissional_unidades(unidade_id, unidades(id, nome))")
      .eq("ativo", true).order("nome")).data ?? [],
  });

  // Query de agendamentos no mês atual
  const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const { data: agendamentosMes, isLoading: loadingAgendamentos } = useQuery({
    queryKey: ["agendamentos-calendario", monthStart, monthEnd, profId, unidadeId],
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select("id, data, hora_inicio, status, prioridade, paciente_id, profissional_id, unidade_id, pacientes(nome, cpf, cns, telefone), profissionais(nome), unidades(nome), especialidades(nome)")
        .gte("data", monthStart)
        .lte("data", monthEnd);

      if (profId !== "all") q = q.eq("profissional_id", profId);
      if (unidadeId !== "all") q = q.eq("unidade_id", unidadeId);
      else if (unidadesAllowed && unidadesAllowed.length > 0) {
        q = q.in("unidade_id", unidadesAllowed.map((u: any) => u.id));
      }

      return (await q).data ?? [];
    },
  });

  // Mapeamento de contagens por dia (YYYY-MM-DD)
  const agendamentosPorDia = useMemo(() => {
    const map = new Map<string, any[]>();
    (agendamentosMes ?? []).forEach((item: any) => {
      const dKey = item.data;
      if (!map.has(dKey)) map.set(dKey, []);
      map.get(dKey)!.push(item);
    });
    return map;
  }, [agendamentosMes]);

  // Gerador da grade de dias do calendário
  const daysInCalendar = useMemo(() => {
    const sMonth = startOfMonth(currentMonth);
    const eMonth = endOfMonth(currentMonth);
    const sWeek = startOfWeek(sMonth, { weekStartsOn: 0 });
    const eWeek = endOfWeek(eMonth, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: sWeek, end: eWeek });
  }, [currentMonth]);

  const handleOpenDay = (day: Date) => {
    setSelectedDay(day);
    setDayModalOpen(true);
  };

  const selectedDayKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : "";
  const selectedDayItems = selectedDayKey ? agendamentosPorDia.get(selectedDayKey) ?? [] : [];

  return (
    <div className="space-y-6">
      {/* Header Bar com Timer de Sincronia de 10s */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-card p-4 rounded-xl border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Matrix de Agendas Integradas
          </h2>
          <p className="text-xs text-muted-foreground">
            Sincronia contínua em tempo real com o banco de dados Firebird.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1.5 text-xs font-semibold border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 animate-pulse flex items-center gap-2">
            <Zap className="h-3.5 w-3.5" /> ⏱️ Próxima sincronização em: 00:{segundosParaSync < 10 ? `0${segundosParaSync}` : segundosParaSync}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["agendamentos-calendario"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Painel de Filtros */}
      <Card>
        <CardContent className="p-4 grid gap-4 md:grid-cols-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Filtrar por Profissional</Label>
            <Select value={profId} onValueChange={setProfId}>
              <SelectTrigger><SelectValue placeholder="Todos os Profissionais" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Profissionais</SelectItem>
                {profs?.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome} {p.especialidades?.nome ? `· ${p.especialidades.nome}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Filtrar por Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue placeholder="Todas as Unidades" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Unidades</SelectItem>
                {unidadesAllowed?.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Navegador de Mês */}
          <div className="flex items-center justify-between border rounded-lg p-1.5 bg-muted/30">
            <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-bold capitalize">
              {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
            </span>
            <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Calendário Interativo em Grade */}
      <Card>
        <CardContent className="p-4">
          {/* Cabeçalho dos Dias da Semana */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs py-2 text-muted-foreground border-b mb-2">
            {diasSemanaHeader.map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>

          {/* Grade de Dias */}
          <div className="grid grid-cols-7 gap-2">
            {daysInCalendar.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const items = agendamentosPorDia.get(dayKey) ?? [];
              const count = items.length;
              const isCurrMonth = isSameMonth(day, currentMonth);
              const isDayToday = isToday(day);

              return (
                <button
                  key={dayKey}
                  onClick={() => handleOpenDay(day)}
                  className={`min-h-[90px] p-2 rounded-xl border text-left transition-all hover:border-primary hover:shadow-md flex flex-col justify-between relative group ${
                    !isCurrMonth ? "opacity-35 bg-muted/20" : "bg-card"
                  } ${isDayToday ? "ring-2 ring-primary border-primary" : ""}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-xs font-bold ${isDayToday ? "text-primary" : "text-foreground"}`}>
                      {format(day, "d")}
                    </span>
                    {isDayToday && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                        Hoje
                      </span>
                    )}
                  </div>

                  {/* Contador de Pacientes no Dia */}
                  {count > 0 ? (
                    <div className="mt-2">
                      <Badge className="w-full justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10.5px] font-bold py-0.5">
                        ● {count} paciente{count > 1 ? "s" : ""}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 italic">Sem agendamentos</span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Modal / Drawer de Inspeção do Dia Selecionado */}
      <Dialog open={dayModalOpen} onOpenChange={setDayModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Calendar className="h-5 w-5 text-primary" />
              Agendamentos de {selectedDay ? format(selectedDay, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}
            </DialogTitle>
            <DialogDescription>
              Pacientes sincronizados pelo Firebird para esta data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {selectedDayItems.length === 0 ? (
              <EmptyState
                icon={User}
                title="Nenhum paciente agendado"
                description="Não há pacientes agendados no sistema Firebird para esta data nesta unidade."
              />
            ) : (
              selectedDayItems.map((item: any) => (
                <div key={item.id} className="p-3.5 rounded-xl border bg-muted/30 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-primary transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">
                        {item.pacientes?.nome ?? "Paciente não identificado"}
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold">
                        {item.prioridade ?? "normal"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-semibold text-primary">
                        <Clock className="h-3.5 w-3.5" /> {item.hora_inicio ? formatTime(item.hora_inicio) : "08:00"}
                      </span>
                      {item.profissionais?.nome && (
                        <span className="flex items-center gap-1">
                          <Stethoscope className="h-3.5 w-3.5" /> {item.profissionais.nome}
                        </span>
                      )}
                      {item.unidades?.nome && (
                        <span>📍 {item.unidades.nome}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <Badge className={`uppercase text-[10px] font-bold px-2.5 py-1 ${
                      item.status === "atendido" ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/40" :
                      item.status === "cancelado" ? "bg-rose-500/20 text-rose-600 border-rose-500/40" :
                      "bg-blue-500/20 text-blue-600 border-blue-500/40"
                    }`}>
                      {item.status ?? "agendado"}
                    </Badge>
                    <Button size="sm" variant="default" onClick={() => {
                      setDayModalOpen(false);
                      navigate({ to: "/app/agenda-dia" as any, search: { data: item.data } as any });
                    }}>
                      Atender
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
