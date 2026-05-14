import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Loader2, CalendarCog } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/profissionais")({ component: ProfissionaisPage });

function ProfissionaisPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: lista, isLoading } = useQuery({
    queryKey: ["profissionais"],
    queryFn: async () => {
      const { data } = await supabase.from("profissionais")
        .select("*, especialidades(nome), unidades(nome)").order("nome");
      return data ?? [];
    },
  });

  const { data: especialidades } = useQuery({
    queryKey: ["especialidades-ativas"],
    queryFn: async () => (await supabase.from("especialidades").select("*").eq("ativo", true).order("nome")).data ?? [],
  });
  const { data: unidades } = useQuery({
    queryKey: ["unidades-ativas"],
    queryFn: async () => (await supabase.from("unidades").select("*").eq("ativo", true).order("nome")).data ?? [],
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Novo profissional
            </Button>
          </DialogTrigger>
          <ProfissionalDialog editing={editing} especialidades={especialidades ?? []} unidades={unidades ?? []}
            onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["profissionais"] }); }} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Conselho</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (<TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground"><Loader2 className="inline mr-2 h-4 w-4 animate-spin"/>Carregando...</TableCell></TableRow>)}
              {!isLoading && lista?.length === 0 && (<TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum profissional cadastrado.</TableCell></TableRow>)}
              {lista?.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell>{p.conselho ? `${p.conselho} ${p.conselho_numero ?? ""}/${p.conselho_uf ?? ""}` : "—"}</TableCell>
                  <TableCell>{p.especialidades?.nome ?? "—"}</TableCell>
                  <TableCell>{p.unidades?.nome ?? "—"}</TableCell>
                  <TableCell>{p.ativo ? <Badge className="bg-success/15 text-success border-0">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button asChild variant="ghost" size="sm"><Link to="/app/agendas" search={{ profissional: p.id } as any}><CalendarCog className="h-4 w-4 mr-1" />Agenda</Link></Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfissionalDialog({ editing, especialidades, unidades, onSaved }: any) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<any>(editing ?? {
    nome: "", conselho: "CRM", conselho_numero: "", conselho_uf: "",
    especialidade_id: "", unidade_id: "", email: "", telefone: "", ativo: true,
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    const { error } = editing
      ? await supabase.from("profissionais").update(payload).eq("id", editing.id)
      : await supabase.from("profissionais").insert(payload);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Profissional atualizado" : "Profissional cadastrado");
    onSaved();
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Editar profissional" : "Novo profissional"}</DialogTitle>
        <DialogDescription>Após cadastrar, abra a Agenda do profissional para gerar as vagas.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs">Nome completo *</Label>
          <Input required value={form.nome} onChange={(e) => set("nome", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Conselho</Label>
          <Select value={form.conselho ?? ""} onValueChange={(v) => set("conselho", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {["CRM","COREN","CRO","CRP","CREFITO","CRN","CRF","Outro"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Número</Label>
          <Input value={form.conselho_numero ?? ""} onChange={(e) => set("conselho_numero", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">UF</Label>
          <Input maxLength={2} value={form.conselho_uf ?? ""} onChange={(e) => set("conselho_uf", e.target.value.toUpperCase())} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Especialidade</Label>
          <Select value={form.especialidade_id ?? ""} onValueChange={(v) => set("especialidade_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{especialidades.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Unidade</Label>
          <Select value={form.unidade_id ?? ""} onValueChange={(v) => set("unidade_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{unidades.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Telefone</Label>
          <Input value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs">E-mail</Label>
          <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </div>
        <DialogFooter className="md:col-span-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
