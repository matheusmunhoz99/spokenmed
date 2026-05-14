import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ListOrdered, Plus, Search, CalendarPlus, Trash2, Loader2, Check, FileText, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { SemAcesso } from "@/components/sem-acesso";
import { formatCPF, formatTime, onlyDigits } from "@/lib/format";
import { gerarComprovante } from "@/lib/pdf-comprovante";

function FilaGuard() {
  const { can } = useAuth();
  if (!can("fila")) return <SemAcesso />;
  return <FilaPage />;
}
export const Route = createFileRoute("/app/fila")({ component: FilaGuard });

const FILA_TABLE = "fila_espera" as const;

function FilaPage() {
  const { user, profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: unidadesAllowed } = useAllowedUnidades();
  const [unidadeId, setUnidadeId] = useState("");
  const [especialidadeId, setEspecialidadeId] = useState("all");
  const [busca, setBusca] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [agendarItem, setAgendarItem] = useState<any>(null);
  const [removerItem, setRemoverItem] = useState<any>(null);

  useEffect(() => {
    if (!unidadeId && unidadesAllowed?.length) setUnidadeId(unidadesAllowed[0].id);
  }, [unidadesAllowed, unidadeId]);

  // Especialidades disponíveis na unidade
  const { data: especs } = useQuery({
    queryKey: ["fila-especs", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profissional_unidades")
        .select("profissionais(especialidade_id, especialidades(id, nome))")
        .eq("unidade_id", unidadeId);
      const map = new Map<string, { id: string; nome: string }>();
      (data ?? []).forEach((r: any) => {
        const e = r.profissionais?.especialidades;
        if (e?.id) map.set(e.id, { id: e.id, nome: e.nome });
      });
      return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });

  // Lista da fila
  const queryKey = ["fila", unidadeId, especialidadeId];
  const { data: fila, isLoading } = useQuery({
    queryKey,
    enabled: !!unidadeId,
    queryFn: async () => {
      let q = (supabase.from(FILA_TABLE as any) as any)
        .select("id, created_at, observacoes, paciente_id, especialidade_id, unidade_id, pacientes(id, nome, cpf, telefone), especialidades(id, nome)")
        .eq("unidade_id", unidadeId)
        .eq("status", "aguardando")
        .order("created_at", { ascending: true });
      if (especialidadeId !== "all") q = q.eq("especialidade_id", especialidadeId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime → invalida a query
  useEffect(() => {
    if (!unidadeId) return;
    const ch = supabase
      .channel(`fila-${unidadeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: FILA_TABLE, filter: `unidade_id=eq.${unidadeId}` },
        () => qc.invalidateQueries({ queryKey: ["fila", unidadeId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [unidadeId, qc]);

  // Calcula posição por especialidade
  const filaComPosicao = useMemo(() => {
    if (!fila) return [];
    const counters: Record<string, number> = {};
    return fila.map((f: any) => {
      counters[f.especialidade_id] = (counters[f.especialidade_id] ?? 0) + 1;
      return { ...f, posicao: counters[f.especialidade_id] };
    });
  }, [fila]);

  const filaFiltrada = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return filaComPosicao;
    const digits = onlyDigits(term);
    return filaComPosicao.filter((f: any) =>
      f.pacientes?.nome?.toLowerCase().includes(term) ||
      (digits.length >= 3 && f.pacientes?.cpf?.includes(digits))
    );
  }, [filaComPosicao, busca]);

  const handleRemover = async (item: any) => {
    const { error } = await (supabase.from(FILA_TABLE as any) as any)
      .update({ status: "cancelado" }).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Removido da fila");
    setRemoverItem(null);
    qc.invalidateQueries({ queryKey: ["fila", unidadeId] });
  };

  const unidadeNome = unidadesAllowed?.find((u: any) => u.id === unidadeId)?.nome ?? "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ListOrdered className="h-5 w-5 text-primary" /> Fila de Espera
            </CardTitle>
            <CardDescription>Pacientes aguardando agendamento por especialidade.</CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} disabled={!unidadeId}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar à fila
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
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
            <Select value={especialidadeId} onValueChange={setEspecialidadeId} disabled={!unidadeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(especs ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Buscar paciente</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CPF" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">
            {filaFiltrada.length} {filaFiltrada.length === 1 ? "paciente" : "pacientes"} na fila
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando...</div>
          ) : filaFiltrada.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              Nenhum paciente aguardando.
            </div>
          ) : (
            <ul className="divide-y">
              {filaFiltrada.map((f: any) => {
                const dias = differenceInDays(new Date(), new Date(f.created_at));
                return (
                  <li key={f.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:gap-4">
                    <div className="flex shrink-0 items-center gap-3 md:contents">
                      <Badge variant="default" className="h-9 min-w-12 justify-center rounded-md px-2 text-base font-bold tabular-nums">
                        #{f.posicao}
                      </Badge>
                      <div className="min-w-0 flex-1 md:min-w-[220px]">
                        <div className="truncate text-sm font-medium">{f.pacientes?.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.especialidades?.nome}
                          {f.pacientes?.cpf && <> · CPF {formatCPF(f.pacientes.cpf)}</>}
                        </div>
                        {f.observacoes && (
                          <div className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">"{f.observacoes}"</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 md:contents">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {dias === 0 ? "hoje" : `${dias} dia${dias > 1 ? "s" : ""}`}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" onClick={() => setAgendarItem(f)}>
                          <CalendarPlus className="mr-1 h-4 w-4" /> Agendar
                        </Button>
                        {isAdmin && (
                          <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                            title="Remover da fila" onClick={() => setRemoverItem(f)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddFilaDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        unidadeId={unidadeId}
        unidadeNome={unidadeNome}
        userId={user?.id}
        especialidades={especs ?? []}
        onCreated={() => qc.invalidateQueries({ queryKey: ["fila", unidadeId] })}
      />

      <AgendarFilaDialog
        item={agendarItem}
        onClose={() => setAgendarItem(null)}
        userId={user?.id}
        userNome={profile?.nome || user?.email || ""}
        onDone={() => qc.invalidateQueries({ queryKey: ["fila", unidadeId] })}
      />

      <AlertDialog open={!!removerItem} onOpenChange={(v) => !v && setRemoverItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da fila?</AlertDialogTitle>
            <AlertDialogDescription>
              {removerItem?.pacientes?.nome} sairá da fila de {removerItem?.especialidades?.nome}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removerItem && handleRemover(removerItem)}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============== Dialog: Adicionar à fila ============== */

function AddFilaDialog({ open, onOpenChange, unidadeId, unidadeNome, userId, especialidades, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  unidadeId: string; unidadeNome: string; userId?: string;
  especialidades: { id: string; nome: string }[];
  onCreated: () => void;
}) {
  const [search, setSearch] = useState("");
  const [paciente, setPaciente] = useState<any>(null);
  const [especialidadeId, setEspecialidadeId] = useState("");
  const [obs, setObs] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch(""); setPaciente(null); setEspecialidadeId(""); setObs("");
    }
  }, [open]);

  const { data: pacResults } = useQuery({
    queryKey: ["pac-search-fila", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const term = search.trim();
      const digits = onlyDigits(term);
      let q = supabase.from("pacientes").select("id, nome, cpf, telefone").limit(10);
      if (digits.length >= 3) q = q.or(`cpf.ilike.%${digits}%,cns.ilike.%${digits}%`);
      else q = q.ilike("nome", `%${term}%`);
      return (await q).data ?? [];
    },
  });

  const handleSalvar = async () => {
    if (!paciente || !especialidadeId || !unidadeId) return;
    setSubmitting(true);
    const { error } = await (supabase.from(FILA_TABLE as any) as any).insert({
      paciente_id: paciente.id,
      unidade_id: unidadeId,
      especialidade_id: especialidadeId,
      observacoes: obs || null,
      criado_por: userId ?? null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Paciente adicionado à fila");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Adicionar à fila</DialogTitle>
          <DialogDescription>Unidade: <strong>{unidadeNome}</strong></DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Paciente</Label>
            {paciente ? (
              <div className="rounded-md border bg-accent/40 p-3">
                <div className="text-sm font-medium">{paciente.nome}</div>
                <div className="text-xs text-muted-foreground">{paciente.cpf ? formatCPF(paciente.cpf) : ""}</div>
                <Button variant="link" size="sm" className="px-0 h-auto" onClick={() => setPaciente(null)}>Trocar paciente</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                </div>
                {pacResults && pacResults.length > 0 && (
                  <ul className="rounded-md border divide-y max-h-48 overflow-y-auto">
                    {pacResults.map((p: any) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setPaciente(p)} className="w-full text-left px-3 py-2 hover:bg-accent">
                          <div className="text-sm font-medium">{p.nome}</div>
                          <div className="text-xs text-muted-foreground">{p.cpf ? formatCPF(p.cpf) : ""}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Especialidade</Label>
            <Select value={especialidadeId} onValueChange={setEspecialidadeId} disabled={especialidades.length === 0}>
              <SelectTrigger><SelectValue placeholder={especialidades.length === 0 ? "Sem especialidades nesta unidade" : "Selecionar"} /></SelectTrigger>
              <SelectContent>
                {especialidades.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observações / encaminhamento</Label>
            <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={!paciente || !especialidadeId || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Check className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== Dialog: Agendar a partir da fila ============== */

function AgendarFilaDialog({ item, onClose, userId, userNome, onDone }: {
  item: any | null; onClose: () => void; userId?: string; userNome: string; onDone: () => void;
}) {
  const open = !!item;
  const [profId, setProfId] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [slot, setSlot] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setProfId(""); setData(format(new Date(), "yyyy-MM-dd")); setSlot(null); }
  }, [open]);

  // Profissionais da unidade que atendem essa especialidade
  const { data: profs } = useQuery({
    queryKey: ["fila-profs", item?.unidade_id, item?.especialidade_id],
    enabled: open,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("profissional_unidades")
        .select("profissionais(id, nome, ativo, especialidade_id)")
        .eq("unidade_id", item.unidade_id);
      return (rows ?? [])
        .map((r: any) => r.profissionais)
        .filter((p: any) => p && p.ativo && p.especialidade_id === item.especialidade_id)
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
    },
  });

  useEffect(() => { setSlot(null); }, [profId, data]);

  const { data: slots } = useQuery({
    queryKey: ["fila-slots", profId, data, item?.unidade_id],
    enabled: !!profId && !!data && !!item,
    queryFn: async () => {
      const { data: rows } = await supabase.from("slots")
        .select("id, hora_inicio, hora_fim, status")
        .eq("profissional_id", profId).eq("data", data).eq("unidade_id", item.unidade_id).eq("status", "livre")
        .order("hora_inicio");
      return rows ?? [];
    },
  });

  const handleConfirmar = async () => {
    if (!item || !slot || !profId) return;
    setSubmitting(true);
    const { error: e1 } = await supabase.from("slots").update({ status: "reservado" }).eq("id", slot.id).eq("status", "livre");
    if (e1) { setSubmitting(false); return toast.error("Vaga não está mais livre."); }
    const { data: created, error: e2 } = await supabase.from("agendamentos").insert({
      slot_id: slot.id, paciente_id: item.paciente_id, profissional_id: profId, unidade_id: item.unidade_id,
      data, hora_inicio: slot.hora_inicio, criado_por: userId,
      motivo: item.observacoes || null,
    }).select("id").single();
    if (e2 || !created) {
      await supabase.from("slots").update({ status: "livre" }).eq("id", slot.id);
      setSubmitting(false);
      return toast.error(e2?.message ?? "Erro ao agendar");
    }
    const { error: e3 } = await (supabase.from(FILA_TABLE as any) as any)
      .update({ status: "agendado", agendamento_id: created.id }).eq("id", item.id);
    setSubmitting(false);
    if (e3) toast.error("Agendado, mas não foi possível atualizar a fila: " + e3.message);
    else toast.success("Paciente agendado e removido da fila");

    // Oferecer comprovante
    const agId = created.id;
    onDone();
    onClose();
    setTimeout(async () => {
      const { data: ag } = await supabase
        .from("agendamentos")
        .select("id, data, hora_inicio, motivo, pacientes(nome, cpf, cns, telefone), profissionais(nome, especialidades(nome)), unidades(nome, endereco, telefone)")
        .eq("id", agId).single();
      if (!ag) return;
      await gerarComprovante({
        codigo: ag.id, data: ag.data, hora: ag.hora_inicio,
        paciente: {
          nome: (ag.pacientes as any)?.nome ?? "—",
          cpf: (ag.pacientes as any)?.cpf, cns: (ag.pacientes as any)?.cns,
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
        motivo: ag.motivo, emitidoPor: userNome,
      });
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5 text-primary" /> Agendar da fila</DialogTitle>
          <DialogDescription>
            <strong>{item?.pacientes?.nome}</strong> · {item?.especialidades?.nome}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Profissional</Label>
              <Select value={profId} onValueChange={setProfId} disabled={!profs || profs.length === 0}>
                <SelectTrigger><SelectValue placeholder={!profs || profs.length === 0 ? "Nenhum profissional" : "Selecionar"} /></SelectTrigger>
                <SelectContent>
                  {(profs ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
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
              <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                Selecione um profissional.
              </div>
            ) : !slots || slots.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                Sem vagas livres nesta data.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 max-h-56 overflow-y-auto">
                {slots.map((s: any) => (
                  <button key={s.id} type="button" onClick={() => setSlot(s)}
                    className={`min-h-11 rounded-md border px-3 py-2 text-sm transition ${
                      slot?.id === s.id ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                    }`}>{formatTime(s.hora_inicio)}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirmar} disabled={!slot || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Confirmar agendamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
