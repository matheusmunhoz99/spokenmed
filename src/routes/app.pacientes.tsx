import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, Loader2, Download, Eye, EyeOff, IdCard } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { formatCPF, formatCNS, formatPhone, formatCEP, onlyDigits, formatDate, isValidCPF } from "@/lib/format";
import { fetchCep } from "@/lib/viacep";
import { buscarPacienteCpf } from "@/lib/cadsus.functions";
import { maskCPF, maskCNS, maskPhone } from "@/lib/mask";
import { downloadCsv } from "@/lib/csv";
import { format } from "date-fns";
import { logViewOnce } from "@/lib/audit";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { Users } from "lucide-react";

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
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

  const hasSearch = debouncedSearch.length >= 2;

  const { data, isLoading } = useQuery({
    queryKey: ["pacientes", debouncedSearch],
    enabled: hasSearch,
    queryFn: async () => {
      let q = supabase.from("pacientes").select("*").order("nome").limit(50);
      const digits = onlyDigits(debouncedSearch);
      if (digits.length >= 3) {
        q = q.or(`cpf.ilike.%${digits}%,cns.ilike.%${digits}%,telefone.ilike.%${digits}%`);
      } else {
        q = q.ilike("nome", `%${debouncedSearch}%`);
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
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["pacientes"] })}>
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF, CNS ou telefone..." className="pl-9"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={toggleReveal}>
            {reveal ? <><EyeOff className="mr-1 h-4 w-4" /> Ocultar dados</> : <><Eye className="mr-1 h-4 w-4" /> Revelar dados</>}
          </Button>
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
              import("@/lib/audit").then((m) => m.logExport("pacientes", "pacientes", { search, count: data.length }));
              toast.success(`${data.length} pacientes exportados`);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Exportar CSV
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button onClick={openNew} className="w-full sm:w-auto"><Plus className="mr-1 h-4 w-4"/>Novo paciente</Button></DialogTrigger>
            {open && (
              <PacienteDialog
                key={editing?.id ?? "novo"}
                editing={editing}
                onOpenExisting={(p) => { setOpen(false); setTimeout(() => openEdit(p), 50); }}
                onSaved={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["pacientes"] }); }}
              />
            )}
          </Dialog>
        </div>
      </div>

      {!hasSearch ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Search}
              title="Comece a buscar"
              description="Digite ao menos 2 caracteres do nome, CPF, CNS ou telefone para localizar um paciente. Nenhum cadastro é carregado automaticamente para manter a tela rápida."
              action={{ label: "Novo paciente", onClick: () => { setEditing(null); setOpen(true); }, icon: Plus }}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid gap-2 md:hidden">
            {isLoading && <LoadingState variant="list" rows={4} />}
            {!isLoading && data?.length === 0 && (
              <EmptyState icon={Users} title="Nenhum paciente encontrado" description="Tente outros termos de busca." action={{ label: "Novo paciente", onClick: () => { setEditing(null); setOpen(true); }, icon: Plus }} />
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
                    {p.cpf ? `CPF ${showCPF(p)}` : p.cns ? `CNS ${showCNS(p)}` : "—"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.telefone ? showPhone(p) : "Sem telefone"}
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
                    <TableRow><TableCell colSpan={7} className="p-3">
                      <LoadingState variant="table" rows={5} />
                    </TableCell></TableRow>
                  )}
                  {!isLoading && data?.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="p-3">
                      <EmptyState icon={Users} title="Nenhum paciente encontrado" description="Ajuste os termos e tente novamente." compact />
                    </TableCell></TableRow>
                  )}
                  {data?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell>{showCPF(p)}</TableCell>
                      <TableCell>{showCNS(p)}</TableCell>
                      <TableCell>{formatDate(p.data_nascimento)}</TableCell>
                      <TableCell>{showPhone(p)}</TableCell>
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
        </>
      )}
    </div>
  );
}

function PacienteDialog({ editing, onSaved, onOpenExisting }: { editing: Paciente | null; onSaved: () => void; onOpenExisting?: (p: Paciente) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cadsusLoading, setCadsusLoading] = useState(false);
  const [cpfErro, setCpfErro] = useState<string | null>(null);
  const [dup, setDup] = useState<{ paciente: Paciente; reason: string; origem: "save" | "cadsus" } | null>(null);
  const buscarCadSus = useServerFn(buscarPacienteCpf);
  const [form, setForm] = useState<any>(editing ?? {
    nome: "", cpf: "", cns: "", rg: "", data_nascimento: "", sexo: "",
    nome_mae: "", telefone: "", email: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
    observacoes: "",
  });

  // procura paciente já cadastrado. Retorna o primeiro match (CPF tem prioridade).
  const findDuplicate = async (opts: { cpfDigits?: string; nome?: string; data?: string }): Promise<{ paciente: Paciente; reason: string } | null> => {
    if (opts.cpfDigits && opts.cpfDigits.length === 11) {
      const { data } = await supabase.from("pacientes").select("id, nome, cpf, data_nascimento").eq("cpf", opts.cpfDigits).limit(1);
      if (data && data.length > 0) {
        const p = data[0];
        if (!editing || p.id !== editing.id) {
          return { paciente: p, reason: `O CPF informado já está cadastrado em ${p.nome}.` };
        }
      }
    }
    if (opts.nome && opts.data) {
      const nomeTrim = opts.nome.trim();
      if (nomeTrim.length >= 3) {
        const { data } = await supabase
          .from("pacientes")
          .select("id, nome, cpf, data_nascimento")
          .ilike("nome", nomeTrim)
          .eq("data_nascimento", opts.data)
          .limit(1);
        if (data && data.length > 0) {
          const p = data[0];
          if (!editing || p.id !== editing.id) {
            return { paciente: p, reason: `Já existe ${p.nome} com a mesma data de nascimento.` };
          }
        }
      }
    }
    return null;
  };

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleCepBlur = async () => {
    const d = onlyDigits(form.cep ?? "");
    if (d.length !== 8) return;
    setCepLoading(true);
    const r = await fetchCep(d);
    setCepLoading(false);
    if (!r) { toast.info("CEP não encontrado."); return; }
    setForm((f: any) => ({
      ...f,
      logradouro: f.logradouro?.trim() ? f.logradouro : r.logradouro,
      bairro: f.bairro?.trim() ? f.bairro : r.bairro,
      cidade: f.cidade?.trim() ? f.cidade : r.cidade,
      uf: f.uf?.trim() ? f.uf : r.uf,
      complemento: f.complemento?.trim() ? f.complemento : (r.complemento ?? f.complemento),
    }));
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('input[data-field="numero"]');
      el?.focus();
    }, 50);
  };

  const handleCpfBlur = () => {
    const d = onlyDigits(form.cpf ?? "");
    if (!d) { setCpfErro(null); return; }
    setCpfErro(isValidCPF(d) ? null : "CPF inválido (dígitos verificadores não conferem).");
  };

  const handleBuscarCadSus = async () => {
    const d = onlyDigits(form.cpf ?? "");
    if (d.length !== 11 || !isValidCPF(d)) {
      toast.error("Informe um CPF válido (11 dígitos).");
      return;
    }
    setCadsusLoading(true);
    try {
      // verifica duplicado ANTES de gastar consulta no Fiorilli
      const found = await findDuplicate({ cpfDigits: d });
      if (found) {
        setDup({ ...found, origem: "cadsus" });
        return;
      }
      const r = await buscarCadSus({ data: { cpf: d } });
      if (!r.ok) {
        console.warn("[cadsus] erro:", r.error);
        const msgs: Record<string, string> = {
          cpf_nao_encontrado: "CPF não encontrado no CadSUS.",
          config_ausente: "Integração CadSUS não configurada (faltam credenciais).",
          browser_indisponivel: "Browser Rendering indisponível neste ambiente.",
          login_invalido: "Login Fiorilli rejeitado — verifique usuário/senha.",
          lookup_sem_resposta: "Fiorilli respondeu, mas sem dados do paciente.",
          timeout: "Tempo esgotado ao consultar o Fiorilli.",
          rede: "Falha de rede ao acessar o Fiorilli.",
          sessao_ausente: "Sessão do CadSUS não configurada. Avise o administrador para renovar em /capture.",
          sessao_expirada: "Sessão do CadSUS expirou. Avise o administrador para renovar em /capture.",
          unauthorized: "Acesso ao CadSUS negado. Verifique a API key.",
          grid_invalida: "CadSUS devolveu resposta inesperada. Tente outro CPF ou renove a sessão.",
        };
        const msg = msgs[r.error] ?? `CadSUS indisponível (${r.error}).`;
        if (r.error === "cpf_nao_encontrado") toast.info(msg);
        else toast.error(msg);
        return;
      }
      const dados = r.dados;
      // converte data dd/mm/aaaa -> yyyy-mm-dd para input type="date"
      const parseDate = (s?: string | null) => {
        if (!s) return "";
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
      };
      setForm((f: any) => ({
        ...f,
        nome: dados.nome ?? f.nome,
        cns: dados.cns ?? f.cns,
        telefone: dados.telefone ?? f.telefone,
        logradouro: dados.logradouro ?? f.logradouro,
        numero: dados.numero ?? f.numero,
        bairro: dados.bairro ?? f.bairro,
        cidade: dados.cidade ?? f.cidade,
        uf: dados.uf ?? f.uf,
        cep: dados.cep ?? f.cep,
        data_nascimento: parseDate(dados.data_nascimento) || f.data_nascimento,
        sexo: dados.sexo ?? f.sexo,
        nome_mae: dados.nome_mae ?? f.nome_mae,
      }));
      setCpfErro(null);
      toast.success("Dados do CadSUS importados.");
    } catch (e) {
      toast.error("Falha ao consultar CadSUS.");
    } finally {
      setCadsusLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const cpfDigits = form.cpf ? onlyDigits(form.cpf) : "";
    // checa duplicados antes de inserir/atualizar
    const found = await findDuplicate({
      cpfDigits: cpfDigits || undefined,
      nome: form.nome,
      data: form.data_nascimento || undefined,
    });
    if (found) {
      setSubmitting(false);
      setDup({ ...found, origem: "save" });
      return;
    }
    const payload = {
      ...form,
      cpf: cpfDigits || null,
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
    <>
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
          <Field label="CPF">
            <div className="flex gap-2">
              <Input
                className="flex-1"
                value={formatCPF(form.cpf ?? "")}
                onChange={(e) => { set("cpf", e.target.value); if (cpfErro) setCpfErro(null); }}
                onBlur={handleCpfBlur}
                aria-invalid={!!cpfErro}
              />
              <Button
                type="button"
                variant="secondary"
                title="Importar dados do cidadão pelo CadSUS"
                disabled={cadsusLoading}
                onClick={handleBuscarCadSus}
                className="shrink-0 gap-2"
              >
                {cadsusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <IdCard className="h-4 w-4" />}
                CadSUS
              </Button>
            </div>
            {cpfErro && <p className="text-xs text-destructive mt-1">{cpfErro}</p>}
          </Field>
          <Field label="Cartão SUS (CNS)"><Input value={formatCNS(form.cns ?? "")} onChange={(e) => set("cns", e.target.value)} /></Field>
          <Field label="RG"><Input value={form.rg ?? ""} onChange={(e) => set("rg", e.target.value)} /></Field>
        </Section>

        <Section title="Contato">
          <Field label="Telefone"><Input value={formatPhone(form.telefone ?? "")} onChange={(e) => set("telefone", e.target.value)} /></Field>
          <Field label="E-mail" className="md:col-span-2"><Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
        </Section>

        <Section title="Endereço">
          <Field label="CEP">
            <div className="relative">
              <Input
                value={formatCEP(form.cep ?? "")}
                onChange={(e) => set("cep", e.target.value)}
                onBlur={handleCepBlur}
                placeholder="00000-000"
              />
              {cepLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </Field>
          <Field label="Logradouro" className="md:col-span-2"><Input value={form.logradouro ?? ""} onChange={(e) => set("logradouro", e.target.value)} /></Field>
          <Field label="Número"><Input data-field="numero" value={form.numero ?? ""} onChange={(e) => set("numero", e.target.value)} /></Field>
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
    <AlertDialog open={!!dup} onOpenChange={(o) => { if (!o) setDup(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Paciente já cadastrado</AlertDialogTitle>
          <AlertDialogDescription>
            {dup?.reason} Deseja abrir o cadastro existente para editar
            {dup?.origem === "cadsus" ? " (a consulta ao CadSUS não será feita)" : ""}?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDup(null)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const p = dup?.paciente;
              setDup(null);
              if (p && onOpenExisting) onOpenExisting(p);
            }}
          >
            Editar existente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
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
