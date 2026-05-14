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

export const Route = createFileRoute("/app/configuracoes")({ component: ConfigPage });

function ConfigPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <UnidadesCard />
      <EspecialidadesCard />
    </div>
  );
}

function UnidadesCard() {
  const qc = useQueryClient();
  const [nome, setNome] = useState(""); const [endereco, setEndereco] = useState(""); const [telefone, setTelefone] = useState("");
  const { data } = useQuery({ queryKey: ["unidades"], queryFn: async () => (await supabase.from("unidades").select("*").order("nome")).data ?? [] });

  const add = async () => {
    if (!nome) return;
    const { error } = await supabase.from("unidades").insert({ nome, endereco: endereco || null, telefone: telefone || null });
    if (error) return toast.error(error.message);
    setNome(""); setEndereco(""); setTelefone(""); toast.success("Unidade cadastrada");
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
          <div className="space-y-1.5"><Label className="text-xs">Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Endereço</Label><Input value={endereco} onChange={(e) => setEndereco(e.target.value)} /></div>
          <div className="md:col-span-4 flex justify-end"><Button onClick={add}><Plus className="mr-1 h-4 w-4" />Adicionar</Button></div>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Telefone</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">Nenhuma unidade cadastrada.</TableCell></TableRow>}
            {data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
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
