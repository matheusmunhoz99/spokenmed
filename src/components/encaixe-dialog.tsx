import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, ZapIcon, UserSearch } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { formatCPF, onlyDigits } from "@/lib/format";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export function EncaixeDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: unidadesAllowed } = useAllowedUnidades();

  const [unidadeId, setUnidadeId] = useState("");
  const [profId, setProfId] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hora, setHora] = useState("");
  const [prioridade, setPrioridade] = useState<"normal" | "prioritaria" | "urgente">("urgente");
  const [justificativa, setJustificativa] = useState("");
  const [search, setSearch] = useState("");
  const [paciente, setPaciente] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUnidadeId(unidadesAllowed?.[0]?.id ?? "");
    setProfId(""); setHora(""); setJustificativa(""); setSearch(""); setPaciente(null);
    setPrioridade("urgente"); setData(format(new Date(), "yyyy-MM-dd"));
  }, [open, unidadesAllowed]);

  const { data: profsUnidade } = useQuery({
    queryKey: ["enc-profs", unidadeId],
    enabled: open && !!unidadeId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("profissional_unidades")
        .select("profissionais(id, nome, ativo, especialidades(nome))")
        .eq("unidade_id", unidadeId);
      return (rows ?? []).map((r: any) => r.profissionais).filter((p: any) => p && p.ativo)
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
    },
  });

  const { data: pacResults } = useQuery({
    queryKey: ["enc-pac", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const term = search.trim();
      const digits = onlyDigits(term);
      let q = supabase.from("pacientes").select("id, nome, cpf, cns").limit(8);
      if (digits.length >= 3) q = q.or(`cpf.ilike.%${digits}%,cns.ilike.%${digits}%`);
      else q = q.ilike("nome", `%${term}%`);
      return (await q).data ?? [];
    },
  });

  const canConfirm = useMemo(
    () => !!unidadeId && !!profId && !!data && !!hora && !!paciente && !!justificativa.trim(),
    [unidadeId, profId, data, hora, paciente, justificativa]
  );

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    const { error } = await supabase.from("agendamentos").insert({
      slot_id: null,
      paciente_id: paciente.id,
      profissional_id: profId,
      unidade_id: unidadeId,
      data,
      hora_inicio: hora.length === 5 ? `${hora}:00` : hora,
      is_encaixe: true,
      encaixe_prioridade: prioridade,
      encaixe_justificativa: justificativa.trim(),
      criado_por: user?.id,
      status: "agendado",
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Encaixe criado.");
    qc.invalidateQueries();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ZapIcon className="h-5 w-5 text-amber-500" /> Encaixe / Overbooking</DialogTitle>
          <DialogDescription>
            Atendimento extra fora da grade regular do profissional. Requer justificativa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Unidade</Label>
            <Select value={unidadeId} onValueChange={(v) => { setUnidadeId(v); setProfId(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {(unidadesAllowed ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Profissional</Label>
            <Select value={profId} onValueChange={setProfId} disabled={!unidadeId}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {(profsUnidade ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}{p.especialidades?.nome ? ` · ${p.especialidades.nome}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hora</Label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Prioridade</Label>
            <Select value={prioridade} onValueChange={(v: any) => setPrioridade(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="prioritaria">Prioritária</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Paciente</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome, CPF ou CNS..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {paciente ? (
              <div className="rounded-md border bg-accent/40 p-2 text-sm">
                <div className="font-medium">{paciente.nome}</div>
                <div className="text-xs text-muted-foreground">{paciente.cpf ? formatCPF(paciente.cpf) : ""}</div>
                <Button variant="link" size="sm" className="px-0 h-auto" onClick={() => setPaciente(null)}>Trocar</Button>
              </div>
            ) : pacResults && pacResults.length > 0 ? (
              <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
                {pacResults.map((p: any) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setPaciente(p)} className="w-full px-3 py-2 text-left hover:bg-accent">
                      <div className="text-sm font-medium">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.cpf ? formatCPF(p.cpf) : ""}</div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Justificativa do encaixe *</Label>
            <Textarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: paciente urgente sem vaga regular, retorno necessário..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar encaixe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
