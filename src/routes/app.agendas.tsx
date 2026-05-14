import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatTime } from "@/lib/format";

export const Route = createFileRoute("/app/agendas")({
  component: AgendasPage,
  validateSearch: (s: Record<string, unknown>) => ({ profissional: (s.profissional as string) ?? "" }),
});

const dias = [
  { v: 0, l: "Dom" }, { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" },
];

function AgendasPage() {
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [profId, setProfId] = useState<string>(search.profissional || "");

  const { data: profs } = useQuery({
    queryKey: ["profissionais-ativos-select"],
    queryFn: async () => (await supabase.from("profissionais").select("id, nome, especialidade_id, unidade_id, especialidades(nome), unidades(nome)").eq("ativo", true).order("nome")).data ?? [],
  });

  const profissional = useMemo(() => profs?.find((p: any) => p.id === profId), [profs, profId]);

  const { data: configs, refetch } = useQuery({
    queryKey: ["agenda-configs", profId],
    enabled: !!profId,
    queryFn: async () => (await supabase.from("agendas_config").select("*").eq("profissional_id", profId).order("vigencia_inicio", { ascending: false })).data ?? [],
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Selecionar profissional</CardTitle>
          <CardDescription>Escolha o profissional para configurar a agenda e gerar as vagas.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={profId} onValueChange={setProfId}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
            <SelectContent>
              {profs?.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome} {p.especialidades?.nome ? `· ${p.especialidades.nome}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {profId && profissional && (
        <>
          <NovaConfigForm
            profissional={profissional}
            onCreated={() => { qc.invalidateQueries({ queryKey: ["agenda-configs", profId] }); }}
          />

          <Card>
            <CardHeader>
              <CardTitle>Configurações de agenda</CardTitle>
              <CardDescription>Histórico de configurações e vagas geradas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!configs || configs.length === 0 ? (
                <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Nenhuma configuração de agenda. Crie a primeira acima para gerar as vagas.
                </div>
              ) : (
                configs.map((c: any) => <ConfigItem key={c.id} cfg={c} onChanged={refetch} />)
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function NovaConfigForm({ profissional, onCreated }: { profissional: any; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [diasSel, setDiasSel] = useState<number[]>([1,2,3,4,5]);
  const [form, setForm] = useState({
    manha_inicio: "08:00", manha_fim: "11:00",
    tarde_inicio: "13:00", tarde_fim: "17:00",
    duracao_min: "30",
    vigencia_inicio: format(new Date(), "yyyy-MM-dd"),
    vigencia_fim: format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd"),
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const toggleDia = (v: number) => {
    setDiasSel((s) => s.includes(v) ? s.filter((x) => x !== v) : [...s, v].sort());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (diasSel.length === 0) return toast.error("Escolha ao menos 1 dia da semana");
    setSubmitting(true);

    const payload: any = {
      profissional_id: profissional.id,
      unidade_id: profissional.unidade_id ?? null,
      dias_semana: diasSel,
      manha_inicio: form.manha_inicio || null,
      manha_fim: form.manha_fim || null,
      tarde_inicio: form.tarde_inicio || null,
      tarde_fim: form.tarde_fim || null,
      duracao_min: parseInt(form.duracao_min, 10),
      vigencia_inicio: form.vigencia_inicio,
      vigencia_fim: form.vigencia_fim,
    };
    const { data: created, error } = await supabase.from("agendas_config").insert(payload).select("id").single();
    if (error) { setSubmitting(false); return toast.error(error.message); }

    const { data: count, error: errGen } = await supabase.rpc("gerar_slots", { _config_id: created.id });
    setSubmitting(false);
    if (errGen) return toast.error("Erro ao gerar vagas: " + errGen.message);
    toast.success(`Agenda publicada — ${count} vagas geradas`);
    onCreated();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurar nova agenda — {profissional.nome}</CardTitle>
        <CardDescription>Defina os dias, horários e duração de cada consulta. As vagas são geradas automaticamente.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="text-xs mb-2 block">Dias da semana</Label>
            <div className="flex flex-wrap gap-2">
              {dias.map((d) => (
                <button type="button" key={d.v} onClick={() => toggleDia(d.v)}
                  className={`rounded-md border px-3 py-2 text-sm transition ${
                    diasSel.includes(d.v) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent"
                  }`}>{d.l}</button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border p-4 space-y-3">
              <div className="text-sm font-medium">Período da manhã</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Início</Label><Input type="time" value={form.manha_inicio} onChange={(e) => set("manha_inicio", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Fim</Label><Input type="time" value={form.manha_fim} onChange={(e) => set("manha_fim", e.target.value)} /></div>
              </div>
              <p className="text-[11px] text-muted-foreground">Deixe em branco para não atender pela manhã.</p>
            </div>
            <div className="rounded-md border p-4 space-y-3">
              <div className="text-sm font-medium">Período da tarde</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Início</Label><Input type="time" value={form.tarde_inicio} onChange={(e) => set("tarde_inicio", e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Fim</Label><Input type="time" value={form.tarde_fim} onChange={(e) => set("tarde_fim", e.target.value)} /></div>
              </div>
              <p className="text-[11px] text-muted-foreground">Deixe em branco para não atender à tarde.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Duração de cada consulta</Label>
              <Select value={form.duracao_min} onValueChange={(v) => set("duracao_min", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 15, 20, 30, 40, 45, 60].map((n) => <SelectItem key={n} value={String(n)}>{n} minutos</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Vigência — início</Label><Input type="date" required value={form.vigencia_inicio} onChange={(e) => set("vigencia_inicio", e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Vigência — fim</Label><Input type="date" required value={form.vigencia_fim} onChange={(e) => set("vigencia_fim", e.target.value)} /></div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Publicar agenda e gerar vagas
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ConfigItem({ cfg, onChanged }: { cfg: any; onChanged: () => void }) {
  const { data: counts } = useQuery({
    queryKey: ["slot-counts", cfg.id],
    queryFn: async () => {
      const [t, l] = await Promise.all([
        supabase.from("slots").select("*", { count: "exact", head: true }).eq("agenda_config_id", cfg.id),
        supabase.from("slots").select("*", { count: "exact", head: true }).eq("agenda_config_id", cfg.id).eq("status", "livre"),
      ]);
      return { total: t.count ?? 0, livres: l.count ?? 0 };
    },
  });

  const handleDelete = async () => {
    if (!confirm("Apagar esta configuração e todas as vagas livres? Vagas já agendadas serão preservadas.")) return;
    await supabase.from("slots").delete().eq("agenda_config_id", cfg.id).eq("status", "livre");
    await supabase.from("agendas_config").delete().eq("id", cfg.id);
    toast.success("Configuração removida");
    onChanged();
  };

  const handleRegen = async () => {
    const { data: count, error } = await supabase.rpc("gerar_slots", { _config_id: cfg.id });
    if (error) return toast.error(error.message);
    toast.success(`${count} novas vagas geradas`);
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border bg-card p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">
          {cfg.vigencia_inicio} → {cfg.vigencia_fim}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Dias: {cfg.dias_semana.map((d: number) => dias.find((x) => x.v === d)?.l).join(", ")}</span>
          <span>·</span>
          {cfg.manha_inicio && <span>Manhã {formatTime(cfg.manha_inicio)}–{formatTime(cfg.manha_fim)}</span>}
          {cfg.manha_inicio && cfg.tarde_inicio && <span>·</span>}
          {cfg.tarde_inicio && <span>Tarde {formatTime(cfg.tarde_inicio)}–{formatTime(cfg.tarde_fim)}</span>}
          <span>·</span>
          <span>{cfg.duracao_min} min/consulta</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="secondary">{counts?.livres ?? 0} livres / {counts?.total ?? 0} totais</Badge>
        <Button variant="outline" size="sm" onClick={handleRegen}><Sparkles className="h-4 w-4 mr-1" />Regerar</Button>
        <Button variant="ghost" size="sm" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
// silence unused import in some builds
void Checkbox;
