import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Upload, ShieldCheck, Download, Copy, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
import { assinarPdf, baixarPdf } from "@/lib/pdf-sign";
import { buildVerifyUrl } from "@/lib/verificacao-url";

export const Route = createFileRoute("/app/assinaturas")({
  component: AssinaturasGuard,
  head: () => ({
    meta: [
      { title: "Assinatura digital de PDF · SpokenMED" },
      { name: "description", content: "Assine documentos PDF eletronicamente com carimbo de autor, data, hora, IP e protocolo público de verificação." },
      { property: "og:title", content: "Assinatura digital de PDF · SpokenMED" },
      { property: "og:description", content: "Assine PDFs com validade jurídica e verificação pública por protocolo e QR code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AssinaturasGuard() {
  const { can, isAdmin } = useAuth();
  if (!isAdmin && !can("assinaturas", "view")) return <SemAcesso titulo="Assinatura Digital" />;
  return <AssinaturasPage />;
}

type Registro = {
  id: string;
  protocolo: string;
  nome_arquivo: string;
  motivo: string | null;
  assinante_nome: string;
  assinante_conselho: string | null;
  assinado_em: string;
  storage_path: string | null;
};

function AssinaturasPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [motivo, setMotivo] = useState("");
  const [assinando, setAssinando] = useState(false);
  const [busca, setBusca] = useState("");
  const [ultimo, setUltimo] = useState<{ protocolo: string; nome: string } | null>(null);

  const { data: registros, isLoading } = useQuery({
    queryKey: ["assinaturas-pdf", busca],
    queryFn: async () => {
      let q = supabase
        .from("assinaturas_pdf")
        .select("id, protocolo, nome_arquivo, motivo, assinante_nome, assinante_conselho, assinado_em, storage_path")
        .order("assinado_em", { ascending: false })
        .limit(50);
      if (busca.trim()) q = q.or(`protocolo.ilike.%${busca.trim()}%,nome_arquivo.ilike.%${busca.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Registro[];
    },
  });

  const handleAssinar = async () => {
    if (!file) return toast.error("Selecione um arquivo PDF.");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return toast.error("Apenas arquivos PDF são aceitos.");
    }
    if (file.size > 20 * 1024 * 1024) return toast.error("Arquivo maior que 20 MB.");
    setAssinando(true);
    try {
      const bytes = await file.arrayBuffer();
      const res = await assinarPdf({ bytes, nomeArquivo: file.name, motivo: motivo.trim() || null });
      baixarPdf(res.bytes, file.name.replace(/\.pdf$/i, "") + "-assinado.pdf");
      setUltimo({ protocolo: res.protocolo, nome: file.name });
      setFile(null);
      setMotivo("");
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["assinaturas-pdf"] });
      toast.success("Documento assinado com sucesso!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao assinar o documento.");
    } finally {
      setAssinando(false);
    }
  };

  const baixarArquivado = async (r: Registro) => {
    if (!r.storage_path) return toast.error("Arquivo não arquivado.");
    const { data, error } = await supabase.storage.from("assinaturas-pdf").createSignedUrl(r.storage_path, 300);
    if (error || !data) return toast.error("Não foi possível gerar o link.");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success("Copiado"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileSignature className="h-5 w-5 text-primary" /> Assinar documento PDF
          </CardTitle>
          <CardDescription>
            Assinatura eletrônica avançada: grava autor, cargo/conselho, data, hora, IP e protocolo público de verificação dentro do arquivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-primary/60"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{file ? file.name : "Arraste o PDF aqui ou selecione"}</p>
            <p className="text-xs text-muted-foreground">
              {file ? `${(file.size / 1024).toFixed(0)} KB` : "Somente arquivos .pdf até 20 MB"}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" size="sm" className="mt-3" onClick={() => inputRef.current?.click()}>
              Escolher arquivo
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Finalidade / motivo da assinatura (opcional)</Label>
            <Textarea
              rows={2}
              value={motivo}
              maxLength={300}
              placeholder="Ex.: Autorização de exame, laudo, encaminhamento…"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <Button onClick={handleAssinar} disabled={!file || assinando} className="w-full gap-2">
            {assinando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {assinando ? "Assinando…" : "Assinar digitalmente"}
          </Button>

          {ultimo && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4" /> {ultimo.nome} assinado
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Protocolo público de verificação:</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="rounded bg-background px-2 py-1 font-mono text-xs">{ultimo.protocolo}</code>
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => copiar(ultimo.protocolo)}>
                  <Copy className="h-3 w-3" /> Copiar
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => window.open(buildVerifyUrl(ultimo.protocolo), "_blank", "noopener")}>
                  <Search className="h-3 w-3" /> Verificar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos assinados</CardTitle>
          <CardDescription>Últimas 50 assinaturas registradas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Buscar por protocolo ou arquivo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Separator />
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && (registros ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum documento assinado ainda.</p>
          )}
          <div className="space-y-2">
            {(registros ?? []).map((r) => (
              <div key={r.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.nome_arquivo}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{r.protocolo}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.assinante_nome}
                      {r.assinante_conselho ? ` · ${r.assinante_conselho}` : ""} ·{" "}
                      {new Date(r.assinado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                    {r.motivo && <Badge variant="secondary" className="mt-1 text-[10px]">{r.motivo}</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => baixarArquivado(r)}>
                    <Download className="h-3 w-3" /> Baixar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => copiar(r.protocolo)}>
                    <Copy className="h-3 w-3" /> Protocolo
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
