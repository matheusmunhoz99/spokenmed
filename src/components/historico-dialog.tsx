import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  History, Plus, Zap, CalendarClock, ArrowRight, XCircle, MessageSquare,
  Trash2, Clock, MapPin, Stethoscope, User,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { StatusBadge } from "@/routes/app.index";
import { formatTime } from "@/lib/format";

const EVENTO_META: Record<string, { label: string; icon: any; cls: string }> = {
  criado:           { label: "Agendamento criado", icon: Plus,         cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-blue-500/30" },
  encaixe_criado:   { label: "Encaixe criado",     icon: Zap,          cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-amber-500/30" },
  reagendado:       { label: "Reagendado",         icon: CalendarClock,cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/30" },
  status_alterado:  { label: "Status atualizado",  icon: ArrowRight,   cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300 ring-slate-500/30" },
  cancelado:        { label: "Cancelado",          icon: XCircle,      cls: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/30" },
  excluido:         { label: "Excluído",           icon: Trash2,       cls: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/30" },
  observacao:       { label: "Observação",         icon: MessageSquare,cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30" },
};

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora há pouco";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function fmtDate(d?: string | null) {
  if (!d) return null;
  try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }); }
  catch { return d; }
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", medico: "Médico(a)", enfermagem: "Enfermagem",
  recepcionista: "Recepção", gestor: "Gestor", farmacia: "Farmácia",
};

export function HistoricoDialog({
  open, onOpenChange, agendamentoId, pacienteNome,
}: { open: boolean; onOpenChange: (v: boolean) => void; agendamentoId: string | null; pacienteNome?: string }) {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["hist-ag", agendamentoId],
    enabled: open && !!agendamentoId,
    queryFn: async () => {
      const { data } = await (supabase.from("agendamento_historico" as any) as any)
        .select("*")
        .eq("agendamento_id", agendamentoId)
        .order("created_at", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  // Coleta ids referenciados para resolver nomes
  const refs = useMemo(() => {
    const profs = new Set<string>(); const unids = new Set<string>(); const slots = new Set<string>();
    (rows ?? []).forEach((r: any) => {
      [r.de, r.para].forEach((b: any) => {
        if (!b || typeof b !== "object") return;
        if (b.profissional_id) profs.add(b.profissional_id);
        if (b.unidade_id) unids.add(b.unidade_id);
        if (b.slot_id) slots.add(b.slot_id);
      });
    });
    return { profs: [...profs], unids: [...unids], slots: [...slots] };
  }, [rows]);

  const { data: dict } = useQuery({
    queryKey: ["hist-dict", refs.profs.join(","), refs.unids.join(","), refs.slots.join(",")],
    enabled: open && (refs.profs.length + refs.unids.length + refs.slots.length) > 0,
    queryFn: async () => {
      const out = { profs: new Map<string, string>(), unids: new Map<string, string>(), slots: new Map<string, any>() };
      if (refs.profs.length) {
        const { data } = await supabase.from("profissionais").select("id, nome").in("id", refs.profs);
        (data ?? []).forEach((p: any) => out.profs.set(p.id, p.nome));
      }
      if (refs.unids.length) {
        const { data } = await supabase.from("unidades").select("id, nome").in("id", refs.unids);
        (data ?? []).forEach((u: any) => out.unids.set(u.id, u.nome));
      }
      if (refs.slots.length) {
        const { data } = await supabase.from("slots").select("id, data, hora_inicio").in("id", refs.slots);
        (data ?? []).forEach((s: any) => out.slots.set(s.id, s));
      }
      return out;
    },
  });

  const prof = (id?: string) => (id && dict?.profs.get(id)) || null;
  const unid = (id?: string) => (id && dict?.unids.get(id)) || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Linha do tempo</DialogTitle>
          <DialogDescription>{pacienteNome ?? "Agendamento"}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState variant="list" rows={3} />
        ) : !rows || rows.length === 0 ? (
          <EmptyState icon={History} title="Sem eventos no histórico" compact />
        ) : (
          <ol className="relative space-y-3 border-l-2 border-dashed border-muted pl-6 mt-2">
            {rows.map((r: any) => {
              const meta = EVENTO_META[r.evento] ?? { label: r.evento, icon: History, cls: "bg-muted text-foreground ring-muted-foreground/20" };
              const Icon = meta.icon;
              const created = new Date(r.created_at);
              const autor = r.user_email || r.user_role
                ? `${r.user_role ? (ROLE_LABEL[r.user_role] ?? r.user_role) : ""}${r.user_email ? ` · ${r.user_email}` : ""}`.trim()
                : null;

              return (
                <li key={r.id} className="relative">
                  <span className={`absolute -left-[34px] top-0.5 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-background ${meta.cls.replace(/ring-\S+/g, "")}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>

                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <div
                        className="text-[11px] text-muted-foreground"
                        title={created.toLocaleString("pt-BR")}
                      >
                        {relativeTime(r.created_at)}
                      </div>
                    </div>

                    {/* Corpo do evento */}
                    <div className="mt-2 space-y-2 text-sm">
                      {r.evento === "criado" || r.evento === "encaixe_criado" ? (
                        <DetalhesAgendamento body={r.para} prof={prof} unid={unid} />
                      ) : r.evento === "status_alterado" ? (
                        <StatusChange de={r.de} para={r.para} />
                      ) : r.evento === "reagendado" ? (
                        <Reagendamento de={r.de} para={r.para} prof={prof} unid={unid} />
                      ) : r.evento === "excluido" ? (
                        <DetalhesAgendamento body={r.de} prof={prof} unid={unid} excluido />
                      ) : null}

                      {r.motivo && (
                        <div className="rounded-md border-l-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1.5 text-xs italic text-amber-900 dark:text-amber-200">
                          <span className="font-medium not-italic">Motivo:</span> {r.motivo}
                        </div>
                      )}
                    </div>

                    {autor && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User className="h-3 w-3" /> {autor}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoLine({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" /> <span className="text-foreground">{children}</span>
    </div>
  );
}

function DetalhesAgendamento({ body, prof, unid, excluido }: { body: any; prof: (id?: string) => string | null; unid: (id?: string) => string | null; excluido?: boolean }) {
  if (!body || typeof body !== "object") return null;
  const data = fmtDate(body.data);
  const hora = body.hora_inicio ? formatTime(body.hora_inicio) : null;
  const nomeProf = prof(body.profissional_id) ?? body.profissional ?? null;
  const nomeUnid = unid(body.unidade_id) ?? body.unidade ?? null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {(data || hora) && (
        <InfoLine icon={CalendarClock}>
          {data}{data && hora ? " · " : ""}{hora}
        </InfoLine>
      )}
      {nomeProf && <InfoLine icon={Stethoscope}>{nomeProf}</InfoLine>}
      {nomeUnid && <InfoLine icon={MapPin}>{nomeUnid}</InfoLine>}
      {body.is_encaixe && (
        <InfoLine icon={Zap}>
          Encaixe{body.encaixe_prioridade ? ` · prioridade ${body.encaixe_prioridade}` : ""}
        </InfoLine>
      )}
      {excluido && body.status && (
        <InfoLine icon={History}>
          Status no momento da exclusão: <StatusBadge status={body.status} />
        </InfoLine>
      )}
    </div>
  );
}

function StatusChange({ de, para }: { de: any; para: any }) {
  const s1 = de?.status, s2 = para?.status;
  if (!s1 && !s2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {s1 ? <StatusBadge status={s1} /> : <Badge variant="outline">—</Badge>}
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
      {s2 ? <StatusBadge status={s2} /> : <Badge variant="outline">—</Badge>}
    </div>
  );
}

function Reagendamento({ de, para, prof, unid }: { de: any; para: any; prof: (id?: string) => string | null; unid: (id?: string) => string | null }) {
  const fmt = (b: any) => {
    if (!b || typeof b !== "object") return null;
    const dt = fmtDate(b.data);
    const hr = b.hora_inicio ? formatTime(b.hora_inicio) : null;
    const pn = prof(b.profissional_id);
    const un = unid(b.unidade_id);
    return (
      <div className="rounded-md border bg-muted/30 p-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium">
          <Clock className="h-3.5 w-3.5" /> {dt ?? "—"}{dt && hr ? " · " : ""}{hr ?? ""}
        </div>
        {pn && <div className="mt-0.5 text-muted-foreground">{pn}</div>}
        {un && <div className="text-muted-foreground">{un}</div>}
      </div>
    );
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">De</div>
        {fmt(de)}
      </div>
      <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground justify-self-center" />
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Para</div>
        {fmt(para)}
      </div>
    </div>
  );
}
