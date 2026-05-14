import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History, Loader2 } from "lucide-react";

const EVENTO_LABEL: Record<string, { label: string; color: string }> = {
  criado: { label: "Criado", color: "bg-blue-100 text-blue-800 border-blue-200" },
  encaixe_criado: { label: "Encaixe", color: "bg-amber-100 text-amber-800 border-amber-200" },
  reagendado: { label: "Reagendado", color: "bg-violet-100 text-violet-800 border-violet-200" },
  status_alterado: { label: "Status", color: "bg-slate-100 text-slate-800 border-slate-200" },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-800 border-red-200" },
  observacao: { label: "Observação", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
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
      return data ?? [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Histórico</DialogTitle>
          <DialogDescription>{pacienteNome ?? "Agendamento"}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Carregando...
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Sem eventos.</div>
        ) : (
          <ol className="relative space-y-4 border-l border-muted pl-6">
            {rows.map((r: any) => {
              const cfg = EVENTO_LABEL[r.evento] ?? { label: r.evento, color: "bg-muted" };
              return (
                <li key={r.id} className="relative">
                  <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cfg.color}>{cfg.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  {r.motivo && <div className="mt-1 text-sm">{r.motivo}</div>}
                  {(r.de || r.para) && (
                    <pre className="mt-1.5 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug text-muted-foreground">
                      {r.de && `de:   ${JSON.stringify(r.de)}\n`}
                      {r.para && `para: ${JSON.stringify(r.para)}`}
                    </pre>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
