import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CalendarClock, CalendarX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { formatTime } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agendamento: any | null;
};

export function ReagendarDialog({ open, onOpenChange, agendamento }: Props) {
  const qc = useQueryClient();
  const [data, setData] = useState<string>("");
  const [novoSlotId, setNovoSlotId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && agendamento) {
      setData(format(new Date(), "yyyy-MM-dd"));
      setNovoSlotId("");
      setMotivo("");
    }
  }, [open, agendamento]);

  const profId = agendamento?.profissional_id ?? agendamento?.profissionais?.id;
  const unidadeId = agendamento?.unidade_id;

  const { data: slots, isLoading } = useQuery({
    queryKey: ["reag-slots", profId, unidadeId, data],
    enabled: open && !!profId && !!data,
    queryFn: async () => {
      let q = supabase.from("slots")
        .select("id, hora_inicio, hora_fim, status")
        .eq("profissional_id", profId)
        .eq("data", data)
        .eq("status", "livre")
        .order("hora_inicio");
      if (unidadeId) q = q.eq("unidade_id", unidadeId);
      return (await q).data ?? [];
    },
  });

  const handleConfirm = async () => {
    if (!agendamento || !novoSlotId || !motivo.trim()) {
      return toast.error("Selecione um novo horário e informe o motivo.");
    }
    setSubmitting(true);
    const slot = slots?.find((s: any) => s.id === novoSlotId);
    if (!slot) { setSubmitting(false); return toast.error("Horário inválido."); }

    const { error } = await supabase.from("agendamentos").update({
      slot_id: novoSlotId,
      data,
      hora_inicio: slot.hora_inicio,
      // status volta para "agendado" se estava cancelado/faltou? Não — mantém status atual.
    }).eq("id", agendamento.id);

    if (error) {
      setSubmitting(false);
      return toast.error(error.message);
    }

    // grava motivo no histórico
    await (supabase.from("agendamento_historico" as any) as any).insert({
      agendamento_id: agendamento.id,
      evento: "observacao",
      motivo: `Reagendamento: ${motivo.trim()}`,
    });

    toast.success("Agendamento reagendado.");
    qc.invalidateQueries();
    setSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Reagendar consulta</DialogTitle>
          <DialogDescription>
            {agendamento?.pacientes?.nome} · {agendamento?.profissionais?.nome}
            {agendamento && ` · atual: ${formatTime(agendamento.hora_inicio)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nova data</Label>
            <Input type="date" value={data} onChange={(e) => { setData(e.target.value); setNovoSlotId(""); }} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Novo horário (vagas livres)</Label>
            {isLoading ? (
              <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : !slots || slots.length === 0 ? (
              <EmptyState icon={CalendarX} title="Sem vagas livres nesta data" compact />
            ) : (
              <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {slots.map((s: any) => (
                  <button key={s.id} type="button" onClick={() => setNovoSlotId(s.id)}
                    className={`min-h-10 rounded-md border px-2 py-1.5 text-sm transition ${
                      novoSlotId === s.id ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
                    }`}>
                    {formatTime(s.hora_inicio)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Motivo do reagendamento *</Label>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: paciente solicitou, profissional indisponível, urgência..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={submitting || !novoSlotId || !motivo.trim()}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar reagendamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
