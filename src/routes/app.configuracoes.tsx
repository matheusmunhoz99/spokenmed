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
import { Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
import { CsvImportDialog, type ColumnSpec, type ParsedRow, normName } from "@/components/csv-import-dialog";
function ConfigGuard() {
  const { can } = useAuth();
  if (!can("unidades_especialidades")) return <SemAcesso />;
  return <ConfigPage />;
}
export const Route = createFileRoute("/app/configuracoes")({ component: ConfigGuard });

const unidadeColumns: ColumnSpec[] = [
  {
    key: "nome", label: "Nome", required: true,
    aliases: ["unidade", "estabelecimento", "nome_unidade", "nome_estabelecimento", "razao_social"],
    transform: (v) => v.replace(/\s+/g, " ").trim(),
    validate: (v) => (String(v).length < 2 ? "nome muito curto" : null),
  },
  {
    key: "cnes", label: "CNES", required: true,
    aliases: ["codigo_cnes", "cod_cnes", "cnes_unidade"],
    transform: (v) => v.replace(/\D/g, ""),
    validate: (v) => (String(v).length !== 7 ? "CNES deve ter 7 dígitos" : null),
  },
  { key: "endereco", label: "Endereço", aliases: ["logradouro", "address"], transform: (v) => v.trim() || "" },
  { key: "telefone", label: "Telefone", aliases: ["fone", "tel", "phone"], transform: (v) => v.trim() || "" },
];

const procedimentoColumns: ColumnSpec[] = [
  {
    key: "codigo_sigtap", label: "Código SIGTAP", required: true,
    aliases: ["codigo", "cod_sigtap", "sigtap", "cod_procedimento", "codigo_procedimento", "co_procedimento"],
    transform: (v) => v.replace(/\D/g, ""),
    validate: (v) => {
      const s = String(v);
      if (s.length < 7 || s.length > 10) return "código SIGTAP deve ter 7 a 10 dígitos";
      return null;
    },
  },
  {
    key: "nome", label: "Descrição", required: true,
    aliases: ["descricao", "nome_procedimento", "ds_procedimento", "procedimento"],
    transform: (v) => v.replace(/\s+/g, " ").trim(),
    validate: (v) => (String(v).length < 3 ? "descrição muito curta" : null),
  },
  {
    key: "valor_sus", label: "Valor SUS", aliases: ["valor", "vl_sus", "valor_total", "vl_total"],
    transform: (v) => {
      const s = v.trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    },
    validate: (v) => (v !== null && v !== undefined && (typeof v !== "number" || v < 0) ? "valor inválido" : null),
  },
];


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
    if (!nome) return toast.error("Informe o nome da unidade.");
    const cnesClean = cnes.replace(/\D/g, "");
    if (cnesClean.length !== 7) return toast.error("CNES é obrigatório e deve ter 7 dígitos.");
    const { error } = await supabase.from("unidades").insert({ nome, endereco: endereco || null, telefone: telefone || null, cnes: cnesClean });
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
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Unidades de Saúde</CardTitle>
          <CardDescription>UBS, postos, hospitais municipais.</CardDescription>
        </div>
        <CsvImportDialog
          trigger={<Button size="sm" variant="outline"><Upload className="h-4 w-4 mr-1" />Importar CSV</Button>}
          title="Importar unidades"
          description="Faz match por CNES (preferencial) e por nome normalizado. Quando achar correspondência, atualiza; caso contrário, cria."
          columns={unidadeColumns}
          sampleFilename="modelo-unidades.csv"
          sampleHeader={["nome", "cnes", "endereco", "telefone"]}
          sampleRows={[
            ["ESF Rio Claro Módulo I (Centro)", "6232205", "Rio Claro/RJ", ""],
            ["Centro de Saúde Boa Vista", "6232272", "Boa Vista, Rio Claro/RJ", ""],
          ]}
          onImport={async (rows) => {
            const existing = (await supabase.from("unidades").select("id, nome, cnes")).data ?? [];
            const byCnes = new Map(existing.filter((u) => u.cnes).map((u) => [u.cnes!, u]));
            const byNome = new Map(existing.map((u) => [normName(u.nome), u]));
            let inserted = 0, updated = 0, skipped = 0;
            for (const r of rows) {
              const cnes = String(r.values.cnes ?? "");
              const nome = String(r.values.nome ?? "");
              const match = byCnes.get(cnes) ?? byNome.get(normName(nome));
              const payload: any = {
                nome,
                cnes,
                endereco: r.values.endereco || null,
                telefone: r.values.telefone || null,
                ativo: true,
              };
              if (match) {
                const { error } = await supabase.from("unidades").update(payload).eq("id", match.id);
                if (error) { skipped++; continue; }
                updated++;
              } else {
                const { error } = await supabase.from("unidades").insert(payload);
                if (error) { skipped++; continue; }
                inserted++;
              }
            }
            qc.invalidateQueries({ queryKey: ["unidades"] });
            return { inserted, updated, skipped };
          }}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="md:col-span-2 space-y-1.5"><Label className="text-xs">Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">CNES * (7 dígitos)</Label><Input required value={cnes} maxLength={7} placeholder="0000000" onChange={(e) => setCnes(e.target.value.replace(/\D/g, ""))} /></div>
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
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Procedimentos SIGTAP</CardTitle>
          <CardDescription>Tabela de procedimentos do SUS para faturamento e relatórios. Use o código oficial SIGTAP.</CardDescription>
        </div>
        <CsvImportDialog
          trigger={<Button size="sm" variant="outline"><Upload className="h-4 w-4 mr-1" />Importar CSV</Button>}
          title="Importar procedimentos SIGTAP"
          description="Faz match pelo código SIGTAP. Existentes são atualizados; novos são inseridos."
          columns={procedimentoColumns}
          sampleFilename="modelo-sigtap.csv"
          sampleHeader={["codigo_sigtap", "nome", "valor_sus"]}
          sampleRows={[
            ["0301010072", "CONSULTA MEDICA EM ATENCAO BASICA", "10,00"],
            ["0101010010", "ACOES COLETIVAS/INDIVIDUAIS EM SAUDE", "0,00"],
          ]}
          onImport={async (rows) => {
            const existing = (await supabase.from("procedimentos").select("id, codigo_sigtap")).data ?? [];
            const byCod = new Map(existing.map((p) => [p.codigo_sigtap, p]));
            let inserted = 0, updated = 0, skipped = 0;
            for (const r of rows) {
              const payload: any = {
                codigo_sigtap: String(r.values.codigo_sigtap),
                nome: String(r.values.nome),
                valor_sus: r.values.valor_sus ?? null,
                ativo: true,
              };
              const match = byCod.get(payload.codigo_sigtap);
              if (match) {
                const { error } = await supabase.from("procedimentos").update(payload).eq("id", match.id);
                if (error) { skipped++; continue; }
                updated++;
              } else {
                const { error } = await supabase.from("procedimentos").insert(payload);
                if (error) { skipped++; continue; }
                inserted++;
              }
            }
            qc.invalidateQueries({ queryKey: ["procedimentos"] });
            return { inserted, updated, skipped };
          }}
        />
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
