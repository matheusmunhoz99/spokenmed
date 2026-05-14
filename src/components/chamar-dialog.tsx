import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agendamento: {
    id: string;
    unidade_id: string | null;
    pacientes?: { nome?: string } | null;
    profissionais?: { nome?: string; sala?: string | null } | null;
  } | null;
  userId?: string;
};

export function ChamarDialog({ open, onOpenChange, agendamento, userId }: Props) {
  const [sala, setSala] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && agendamento) {
      setSala((agendamento.profissionais as any)?.sala ?? "");
    }
  }, [open, agendamento]);

  const handleChamar = async () => {
    if (!agendamento || !agendamento.unidade_id) {
      toast.error("Agendamento sem unidade definida.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("chamadas" as any).insert({
      agendamento_id: agendamento.id,
      unidade_id: agendamento.unidade_id,
      paciente_nome: agendamento.pacientes?.nome ?? "Paciente",
      profissional_nome: agendamento.profissionais?.nome ?? null,
      sala: sala || null,
      chamado_por: userId ?? null,
    } as any);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Paciente chamado no painel");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Chamar paciente</DialogTitle>
          <DialogDescription>O nome será exibido e anunciado no painel da unidade.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-semibold">{agendamento?.pacientes?.nome}</div>
            <div className="text-xs text-muted-foreground">{agendamento?.profissionais?.nome}</div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sala / Local *</Label>
            <Input value={sala} onChange={(e) => setSala(e.target.value)} placeholder="Ex.: Consultório 3" autoFocus />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleChamar} disabled={submitting || !sala.trim()}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Megaphone className="mr-2 h-4 w-4" /> Chamar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
