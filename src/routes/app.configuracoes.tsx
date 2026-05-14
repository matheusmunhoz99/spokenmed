import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
function ConfigGuard() {
  const { can } = useAuth();
  if (!can("unidades_especialidades")) return <SemAcesso />;
  return <ConfigPage />;
}
export const Route = createFileRoute("/app/configuracoes")({ component: ConfigGuard });

function ConfigPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <UnidadesCard />
        <EspecialidadesCard />
      </div>
      <ProcedimentosCard />
    </div>
  );
}

function UnidadesCard() {
  const qc = useQueryClient();
  const [nome, setNome] = useState(""); const [endereco, setEndereco] = useState(""); const [telefone, setTelefone] = useState(""); const [cnes, setCnes] = useState("");
  const { data } = useQuery({ queryKey: ["unidades"], queryFn: async () => (await supabase.from("unidades").select("*").order("nome")).data ?? [] });

  const add = async () => {
    if (!nome) return;
    const cnesClean = cnes.replace(/\D/g, "");
    if (cnesClean && cnesClean.length !== 7) return toast.error("CNES deve ter 7 dígitos.");
    const { error } = await supabase.from("unidades").insert({ nome, endereco: endereco || null, telefone: telefone || null, cnes: cnesClean || null });
    if (error) return toast.error(error.message);
    setNome(""); setEndereco(""); setTelefone(""); setCnes(""); toast.success("Unidade cadastrada");
    qc.invalidateQueries({ queryKey: ["unidades"] });
  };
  const toggle = async (u: any) => {
    await supabase.from("unidades").update({ ativo: !u.ativo }).eq("id", u.id);
    qc.invalidateQueries({ queryKey: ["unidades"] });
  };
  const del = async (id: string) => {
    if (!confirm("Apagar unidade?")) return;
    const { error } = await supabase.from("unidades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["unidades"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Unidades de Saúde</CardTitle><CardDescription>UBS, postos, hospitais municipais.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="md:col-span-2 space-y-1.5"><Label className="text-xs">Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">CNES (7 dígitos)</Label><Input value={cnes} maxLength={7} onChange={(e) => setCnes(e.target.value.replace(/\D/g, ""))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
          <div className="md:col-span-3 space-y-1.5"><Label className="text-xs">Endereço</Label><Input value={endereco} onChange={(e) => setEndereco(e.target.value)} /></div>
          <div className="md:col-span-4 flex justify-end"><Button onClick={add}><Plus className="mr-1 h-4 w-4" />Adicionar</Button></div>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CNES</TableHead><TableHead>Telefone</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">Nenhuma unidade cadastrada.</TableCell></TableRow>}
            {data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell className="font-mono text-xs">{u.cnes ?? "—"}</TableCell>
                <TableCell>{u.telefone ?? "—"}</TableCell>
                <TableCell><button onClick={() => toggle(u)}>{u.ativo ? <Badge className="bg-success/15 text-success border-0">Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</button></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => del(u.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EspecialidadesCard() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const { data } = useQuery({ queryKey: ["especialidades"], queryFn: async () => (await supabase.from("especialidades").select("*").order("nome")).data ?? [] });

  const add = async () => {
    if (!nome) return;
    const { error } = await supabase.from("especialidades").insert({ nome });
    if (error) return toast.error(error.message);
    setNome(""); toast.success("Especialidade cadastrada");
    qc.invalidateQueries({ queryKey: ["especialidades"] });
  };
  const del = async (id: string) => {
    if (!confirm("Apagar especialidade?")) return;
    const { error } = await supabase.from("especialidades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["especialidades"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Especialidades</CardTitle><CardDescription>Áreas de atendimento dos profissionais.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder="Ex.: Clínica Geral, Pediatria..." value={nome} onChange={(e) => setNome(e.target.value)} />
          <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.length === 0 && <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground text-sm">Nenhuma especialidade cadastrada.</TableCell></TableRow>}
            {data?.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.nome}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => del(e.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ProcedimentosCard() {
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const { data } = useQuery({
    queryKey: ["procedimentos"],
    queryFn: async () => (await supabase.from("procedimentos").select("*").order("codigo_sigtap")).data ?? [],
  });

  const add = async () => {
    const cod = codigo.replace(/\D/g, "");
    if (!cod || !nome) return toast.error("Código SIGTAP e nome são obrigatórios.");
    const { error } = await supabase.from("procedimentos").insert({
      codigo_sigtap: cod,
      nome,
      valor_sus: valor ? Number(valor.replace(",", ".")) : null,
    });
    if (error) return toast.error(error.message);
    setCodigo(""); setNome(""); setValor(""); toast.success("Procedimento cadastrado");
    qc.invalidateQueries({ queryKey: ["procedimentos"] });
  };
  const toggle = async (p: any) => {
    await supabase.from("procedimentos").update({ ativo: !p.ativo }).eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["procedimentos"] });
  };
  const del = async (id: string) => {
    if (!confirm("Apagar procedimento?")) return;
    const { error } = await supabase.from("procedimentos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["procedimentos"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Procedimentos SIGTAP</CardTitle>
        <CardDescription>Tabela de procedimentos do SUS para faturamento e relatórios. Use o código oficial SIGTAP.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-12">
          <div className="md:col-span-3 space-y-1.5">
            <Label className="text-xs">Código SIGTAP *</Label>
            <Input value={codigo} maxLength={10} placeholder="Ex.: 0301010072" onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="md:col-span-6 space-y-1.5">
            <Label className="text-xs">Descrição *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs">Valor SUS (R$)</Label>
            <Input value={valor} placeholder="0,00" onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button onClick={add} className="w-full"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">Nenhum procedimento cadastrado.</TableCell></TableRow>}
            {data?.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.codigo_sigtap}</TableCell>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell className="text-right font-mono text-xs">{p.valor_sus ? `R$ ${Number(p.valor_sus).toFixed(2).replace(".", ",")}` : "—"}</TableCell>
                <TableCell><button onClick={() => toggle(p)}>{p.ativo ? <Badge className="bg-success/15 text-success border-0">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</button></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => del(p.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
