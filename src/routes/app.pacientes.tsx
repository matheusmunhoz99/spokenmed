import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, Loader2, Download, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { formatCPF, formatCNS, formatPhone, formatCEP, onlyDigits, formatDate } from "@/lib/format";
import { maskCPF, maskCNS, maskPhone } from "@/lib/mask";
import { downloadCsv } from "@/lib/csv";
import { format } from "date-fns";
import { logViewOnce } from "@/lib/audit";

import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
function PacientesGuard() {
  const { can } = useAuth();
  if (!can("pacientes")) return <SemAcesso />;
  return <PacientesPage />;
}
export const Route = createFileRoute("/app/pacientes")({ component: PacientesGuard });

type Paciente = any;

function PacientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Paciente | null>(null);
  const [reveal, setReveal] = useState(false);
  const toggleReveal = () => {
    setReveal((r) => {
      if (!r) toast.info("Dados sensíveis revelados — esta ação ficará registrada na auditoria ao abrir cada paciente.");
      return !r;
    });
  };
  const showCPF = (p: any) => reveal ? (p.cpf ? formatCPF(p.cpf) : "—") : maskCPF(p.cpf);
  const showCNS = (p: any) => reveal ? (p.cns ? formatCNS(p.cns) : "—") : maskCNS(p.cns);
  const showPhone = (p: any) => reveal ? (p.telefone ? formatPhone(p.telefone) : "—") : maskPhone(p.telefone);

  const { data, isLoading } = useQuery({
    queryKey: ["pacientes", search],
    queryFn: async () => {
      let q = supabase.from("pacientes").select("*").order("nome").limit(200);
      if (search) {
        const term = search.trim();
        const digits = onlyDigits(term);
        if (digits.length >= 3) {
          q = q.or(`cpf.ilike.%${digits}%,cns.ilike.%${digits}%,telefone.ilike.%${digits}%`);
        } else {
          q = q.ilike("nome", `%${term}%`);
        }
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (p: Paciente) => {
    logViewOnce("pacientes", p.id, "pacientes");
    setEditing(p);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF, CNS ou telefone..." className="pl-9"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
          <Button
            variant="outline"
            disabled={!data || data.length === 0}
            className="w-full sm:w-auto"
            onClick={() => {
              if (!data || data.length === 0) return toast.info("Sem pacientes para exportar.");
              downloadCsv(`pacientes_${format(new Date(), "yyyy-MM-dd")}.csv`, data, [
                { header: "Nome", get: (p: any) => p.nome },
                { header: "CPF", get: (p: any) => p.cpf ? formatCPF(p.cpf) : "" },
                { header: "Cartão SUS", get: (p: any) => p.cns ? formatCNS(p.cns) : "" },
                { header: "RG", get: (p: any) => p.rg ?? "" },
                { header: "Nascimento", get: (p: any) => formatDate(p.data_nascimento) === "—" ? "" : formatDate(p.data_nascimento) },
                { header: "Sexo", get: (p: any) => p.sexo ?? "" },
                { header: "Nome da mãe", get: (p: any) => p.nome_mae ?? "" },
                { header: "Telefone", get: (p: any) => p.telefone ? formatPhone(p.telefone) : "" },
                { header: "E-mail", get: (p: any) => p.email ?? "" },
                { header: "CEP", get: (p: any) => p.cep ? formatCEP(p.cep) : "" },
                { header: "Logradouro", get: (p: any) => p.logradouro ?? "" },
                { header: "Número", get: (p: any) => p.numero ?? "" },
                { header: "Complemento", get: (p: any) => p.complemento ?? "" },
                { header: "Bairro", get: (p: any) => p.bairro ?? "" },
                { header: "Cidade", get: (p: any) => p.cidade ?? "" },
                { header: "UF", get: (p: any) => p.uf ?? "" },
                { header: "Observações", get: (p: any) => p.observacoes ?? "" },
              ]);
              toast.success(`${data.length} pacientes exportados`);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Exportar CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew} className="w-full sm:w-auto"><Plus className="mr-1 h-4 w-4"/>Novo paciente</Button></DialogTrigger>
            <PacienteDialog editing={editing} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["pacientes"] }); }} />
          </Dialog>
        </div>
      </div>

      {/* Mobile: cards */}
      <div className="grid gap-2 md:hidden">
        {isLoading && <div className="rounded-md border bg-card p-6 text-center text-muted-foreground"><Loader2 className="inline mr-2 h-4 w-4 animate-spin"/>Carregando...</div>}
        {!isLoading && data?.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum paciente encontrado.</div>
        )}
        {data?.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => openEdit(p)}
            className="flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(p.nome ?? "?").trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{p.nome}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {p.cpf ? `CPF ${formatCPF(p.cpf)}` : p.cns ? `CNS ${formatCNS(p.cns)}` : "—"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {p.telefone ? formatPhone(p.telefone) : "Sem telefone"}
                {p.cidade ? ` · ${p.cidade}/${p.uf ?? ""}` : ""}
              </div>
            </div>
            <Pencil className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Desktop: table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Cartão SUS</TableHead>
                <TableHead>Nascimento</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="inline mr-2 h-4 w-4 animate-spin"/> Carregando...
                </TableCell></TableRow>
              )}
              {!isLoading && data?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nenhum paciente encontrado.
                </TableCell></TableRow>
              )}
              {data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell>{p.cpf ? formatCPF(p.cpf) : "—"}</TableCell>
                  <TableCell>{p.cns ? formatCNS(p.cns) : "—"}</TableCell>
                  <TableCell>{formatDate(p.data_nascimento)}</TableCell>
                  <TableCell>{p.telefone ? formatPhone(p.telefone) : "—"}</TableCell>
                  <TableCell>{p.cidade ? `${p.cidade}/${p.uf ?? ""}` : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
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

function PacienteDialog({ editing, onSaved }: { editing: Paciente | null; onSaved: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<any>(editing ?? {
    nome: "", cpf: "", cns: "", rg: "", data_nascimento: "", sexo: "",
    nome_mae: "", telefone: "", email: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
    observacoes: "",
  });

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      ...form,
      cpf: form.cpf ? onlyDigits(form.cpf) : null,
      cns: form.cns ? onlyDigits(form.cns) : null,
      telefone: form.telefone ? onlyDigits(form.telefone) : null,
      cep: form.cep ? onlyDigits(form.cep) : null,
      data_nascimento: form.data_nascimento || null,
      sexo: form.sexo || null,
    };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });

    const { error } = editing
      ? await supabase.from("pacientes").update(payload).eq("id", editing.id)
      : await supabase.from("pacientes").insert(payload);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Paciente atualizado" : "Paciente cadastrado");
    onSaved();
  };

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? "Editar paciente" : "Novo paciente"}</DialogTitle>
        <DialogDescription>Preencha o cadastro completo do paciente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-5">
        <Section title="Dados pessoais">
          <Field label="Nome completo *" className="md:col-span-3">
            <Input required value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </Field>
          <Field label="Data de nascimento">
            <Input type="date" value={form.data_nascimento ?? ""} onChange={(e) => set("data_nascimento", e.target.value)} />
          </Field>
          <Field label="Sexo">
            <Select value={form.sexo ?? ""} onValueChange={(v) => set("sexo", v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="F">Feminino</SelectItem>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="O">Outro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nome da mãe">
            <Input value={form.nome_mae ?? ""} onChange={(e) => set("nome_mae", e.target.value)} />
          </Field>
          <Field label="CPF"><Input value={formatCPF(form.cpf ?? "")} onChange={(e) => set("cpf", e.target.value)} /></Field>
          <Field label="Cartão SUS (CNS)"><Input value={formatCNS(form.cns ?? "")} onChange={(e) => set("cns", e.target.value)} /></Field>
          <Field label="RG"><Input value={form.rg ?? ""} onChange={(e) => set("rg", e.target.value)} /></Field>
        </Section>

        <Section title="Contato">
          <Field label="Telefone"><Input value={formatPhone(form.telefone ?? "")} onChange={(e) => set("telefone", e.target.value)} /></Field>
          <Field label="E-mail" className="md:col-span-2"><Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
        </Section>

        <Section title="Endereço">
          <Field label="CEP"><Input value={formatCEP(form.cep ?? "")} onChange={(e) => set("cep", e.target.value)} /></Field>
          <Field label="Logradouro" className="md:col-span-2"><Input value={form.logradouro ?? ""} onChange={(e) => set("logradouro", e.target.value)} /></Field>
          <Field label="Número"><Input value={form.numero ?? ""} onChange={(e) => set("numero", e.target.value)} /></Field>
          <Field label="Complemento"><Input value={form.complemento ?? ""} onChange={(e) => set("complemento", e.target.value)} /></Field>
          <Field label="Bairro"><Input value={form.bairro ?? ""} onChange={(e) => set("bairro", e.target.value)} /></Field>
          <Field label="Cidade"><Input value={form.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} /></Field>
          <Field label="UF"><Input maxLength={2} value={form.uf ?? ""} onChange={(e) => set("uf", e.target.value.toUpperCase())} /></Field>
        </Section>

        <Section title="Observações" cols={1}>
          <Textarea value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} rows={3} />
        </Section>

        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Salvar alterações" : "Cadastrar paciente"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Section({ title, children, cols = 4 }: { title: string; children: React.ReactNode; cols?: number }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className={`grid gap-3 md:grid-cols-${cols}`}>{children}</div>
    </div>
  );
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
