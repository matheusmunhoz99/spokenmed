import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Loader2, Upload, Download, Trash2, Paperclip, FileText, Image as ImageIcon, File } from "lucide-react";
import { format } from "date-fns";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.txt";

const CATS: Array<{ v: string; l: string }> = [
  { v: "pedido_medico", l: "Pedido médico" },
  { v: "exame", l: "Exame" },
  { v: "documento", l: "Documento" },
  { v: "foto", l: "Foto" },
  { v: "outro", l: "Outro" },
];

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mime === "application/pdf") return <FileText className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function AnexosDialog({
  open, onOpenChange, agendamento,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agendamento: any | null;
}) {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [categoria, setCategoria] = useState("documento");
  const [descricao, setDescricao] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setCategoria("documento");
      setDescricao("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  const { data: anexos, isLoading } = useQuery({
    queryKey: ["anexos", agendamento?.id],
    enabled: !!agendamento?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamento_anexos")
        .select("*")
        .eq("agendamento_id", agendamento.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !agendamento || !user) return;
    if (file.size > MAX_BYTES) { toast.error("Arquivo excede 10 MB"); return; }
    if (!agendamento.unidade_id) { toast.error("Agendamento sem unidade — não é possível anexar"); return; }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
      const path = `${agendamento.unidade_id}/${agendamento.id}/${crypto.randomUUID()}_${safe}`;

      const { error: upErr } = await supabase.storage
        .from("anexos-agendamentos")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("agendamento_anexos").insert({
        agendamento_id: agendamento.id,
        paciente_id: agendamento.paciente_id,
        unidade_id: agendamento.unidade_id,
        storage_path: path,
        nome_original: file.name,
        mime: file.type || "application/octet-stream",
        tamanho_bytes: file.size,
        categoria: categoria as any,
        descricao: descricao.trim() || null,
        uploaded_by: user.id,
      });
      if (dbErr) {
        // rollback upload
        await supabase.storage.from("anexos-agendamentos").remove([path]);
        throw dbErr;
      }

      toast.success("Anexo enviado");
      setDescricao("");
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["anexos", agendamento.id] });
    } catch (err: any) {
      toast.error("Falha no upload: " + (err?.message ?? "desconhecido"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(a: any) {
    const { data, error } = await supabase.storage
      .from("anexos-agendamentos")
      .createSignedUrl(a.storage_path, 60, { download: a.nome_original });
    if (error || !data) { toast.error("Falha ao gerar link"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(a: any) {
    if (!user) return;
    if (!confirm(`Excluir "${a.nome_original}"?`)) return;
    const { error: delDb } = await supabase
      .from("agendamento_anexos")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq("id", a.id);
    if (delDb) { toast.error("Falha ao excluir: " + delDb.message); return; }
    // remove do storage (best-effort; admin/staff com acesso à unidade)
    await supabase.storage.from("anexos-agendamentos").remove([a.storage_path]);
    toast.success("Anexo removido");
    qc.invalidateQueries({ queryKey: ["anexos", agendamento.id] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Anexos do agendamento
          </DialogTitle>
          <DialogDescription>
            {agendamento?.pacientes?.nome} — {agendamento?.data} {agendamento?.hora_inicio?.slice(0,5)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpload} className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATS.map(c => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input value={descricao} maxLength={200} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Pedido do Dr. Silva" />
            </div>
          </div>
          <div>
            <Label>Arquivo (até 10 MB)</Label>
            <Input ref={fileRef} type="file" accept={ACCEPT} required />
            <p className="mt-1 text-xs text-muted-foreground">PDF, imagens (JPG/PNG/WEBP/HEIC), Word, Excel, TXT.</p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={uploading} size="sm">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Enviar anexo
            </Button>
          </div>
        </form>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Arquivos ({anexos?.length ?? 0})</h4>
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Carregando...</div>
          ) : !anexos?.length ? (
            <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">Nenhum anexo enviado.</div>
          ) : (
            <ul className="divide-y rounded-md border">
              {anexos.map((a: any) => (
                <li key={a.id} className="flex items-center gap-3 p-2">
                  <span className="text-muted-foreground">{iconFor(a.mime)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium" title={a.nome_original}>{a.nome_original}</span>
                      <Badge variant="outline" className="text-[10px]">{CATS.find(c => c.v === a.categoria)?.l ?? a.categoria}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtBytes(a.tamanho_bytes)} · {format(new Date(a.created_at), "dd/MM/yy HH:mm")}
                      {a.descricao ? ` · ${a.descricao}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleDownload(a)} title="Baixar"><Download className="h-4 w-4" /></Button>
                  {(isAdmin || a.uploaded_by === user?.id) && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(a)} title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
