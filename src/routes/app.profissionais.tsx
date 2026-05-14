import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
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

import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
function ProfissionaisGuard() {
  const { can } = useAuth();
  if (!can("profissionais")) return <SemAcesso />;
  return <ProfissionaisPage />;
}
export const Route = createFileRoute("/app/profissionais")({ component: ProfissionaisGuard });

function ProfissionaisPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: lista, isLoading } = useQuery({
    queryKey: ["profissionais"],
    queryFn: async () => {
      const { data } = await supabase.from("profissionais")
        .select("*, especialidades(nome), profissional_unidades(unidade_id, unidades(id, nome))")
        .order("nome");
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
      <div className="flex justify-stretch sm:justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setOpen(true); }} className="w-full sm:w-auto">
              <Plus className="mr-1 h-4 w-4" /> Novo profissional
            </Button>
          </DialogTrigger>
          <ProfissionalDialog editing={editing} especialidades={especialidades ?? []} unidades={unidades ?? []}
            onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["profissionais"] }); }} />
        </Dialog>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-2 md:hidden">
        {isLoading && <div className="rounded-md border bg-card p-6 text-center text-muted-foreground"><Loader2 className="inline mr-2 h-4 w-4 animate-spin"/>Carregando...</div>}
        {!isLoading && lista?.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum profissional cadastrado.</div>
        )}
        {lista?.map((p: any) => {
          const us = (p.profissional_unidades ?? []).map((pu: any) => pu.unidades).filter(Boolean);
          return (
            <div key={p.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.nome}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.especialidades?.nome ?? "Sem especialidade"}
                    {p.conselho ? ` · ${p.conselho} ${p.conselho_numero ?? ""}/${p.conselho_uf ?? ""}` : ""}
                  </div>
                </div>
                {p.ativo ? <Badge className="bg-success/15 text-success border-0">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
              </div>
              {us.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {us.map((u: any) => <Badge key={u.id} variant="outline" className="font-normal">{u.nome}</Badge>)}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link to="/app/agendas" search={{ profissional: p.id } as any}><CalendarCog className="h-4 w-4 mr-1" />Agenda</Link>
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditing({ ...p, _unidade_ids: us.map((u: any) => u.id) }); setOpen(true); }}>
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Conselho</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead>Unidades</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (<TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground"><Loader2 className="inline mr-2 h-4 w-4 animate-spin"/>Carregando...</TableCell></TableRow>)}
              {!isLoading && lista?.length === 0 && (<TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum profissional cadastrado.</TableCell></TableRow>)}
              {lista?.map((p: any) => {
                const us = (p.profissional_unidades ?? []).map((pu: any) => pu.unidades).filter(Boolean);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.conselho ? `${p.conselho} ${p.conselho_numero ?? ""}/${p.conselho_uf ?? ""}` : "—"}</TableCell>
                    <TableCell>{p.especialidades?.nome ?? "—"}</TableCell>
                    <TableCell>
                      {us.length === 0 ? <span className="text-muted-foreground text-xs">Nenhuma</span> : (
                        <div className="flex flex-wrap gap-1">
                          {us.map((u: any) => <Badge key={u.id} variant="outline" className="font-normal">{u.nome}</Badge>)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{p.ativo ? <Badge className="bg-success/15 text-success border-0">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button asChild variant="ghost" size="sm"><Link to="/app/agendas" search={{ profissional: p.id } as any}><CalendarCog className="h-4 w-4 mr-1" />Agenda</Link></Button>
                      <Button variant="ghost" size="sm" onClick={() => { setEditing({ ...p, _unidade_ids: us.map((u: any) => u.id) }); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
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
    especialidade_id: "", email: "", telefone: "", sala: "", ativo: true,
  });
  const [unidadeIds, setUnidadeIds] = useState<string[]>(editing?._unidade_ids ?? []);

  useEffect(() => {
    setForm(editing ?? { nome: "", conselho: "CRM", conselho_numero: "", conselho_uf: "", especialidade_id: "", email: "", telefone: "", sala: "", ativo: true });
    setUnidadeIds(editing?._unidade_ids ?? []);
  }, [editing]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const toggleUnidade = (id: string) => setUnidadeIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unidadeIds.length === 0) return toast.error("Vincule o profissional a pelo menos uma unidade.");
    setSubmitting(true);

    const payload: any = {
      nome: form.nome, conselho: form.conselho || null, conselho_numero: form.conselho_numero || null,
      conselho_uf: form.conselho_uf || null, especialidade_id: form.especialidade_id || null,
      unidade_id: unidadeIds[0], // primeira como "principal" (compat)
      email: form.email || null, telefone: form.telefone || null, sala: form.sala || null, ativo: form.ativo,
    };

    let profId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("profissionais").update(payload).eq("id", editing.id);
      if (error) { setSubmitting(false); return toast.error(error.message); }
    } else {
      const { data, error } = await supabase.from("profissionais").insert(payload).select("id").single();
      if (error) { setSubmitting(false); return toast.error(error.message); }
      profId = data.id;
    }

    // Sincroniza vínculos com unidades
    await supabase.from("profissional_unidades").delete().eq("profissional_id", profId);
    const rows = unidadeIds.map((uid) => ({ profissional_id: profId, unidade_id: uid }));
    const { error: linkErr } = await supabase.from("profissional_unidades").insert(rows);
    setSubmitting(false);
    if (linkErr) return toast.error(linkErr.message);

    toast.success(editing ? "Profissional atualizado" : "Profissional cadastrado");
    onSaved();
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Editar profissional" : "Novo profissional"}</DialogTitle>
        <DialogDescription>O profissional pode atender em mais de uma unidade. Cada agenda é por unidade.</DialogDescription>
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
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs">Unidades onde atende *</Label>
          {unidades.length === 0 ? (
            <p className="text-xs text-muted-foreground">Cadastre unidades em Configurações antes de continuar.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unidades.map((u: any) => (
                <button type="button" key={u.id} onClick={() => toggleUnidade(u.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs transition ${
                    unidadeIds.includes(u.id) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-accent"
                  }`}>{u.nome}</button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Telefone</Label>
          <Input value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} />
        </div>
        <div className="space-y-1.5">
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
