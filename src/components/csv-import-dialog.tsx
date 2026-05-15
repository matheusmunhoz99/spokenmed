import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Importação genérica via CSV/TSV/planilha colada.
 * - Detecta separador: ; , \t |
 * - Aceita BOM, aspas simples/duplas
 * - Faz match flexível de cabeçalho por sinônimos
 * - Pré-visualiza linhas válidas/erros antes de gravar
 */

export type ColumnSpec = {
  /** chave canônica devolvida em cada linha parseada */
  key: string;
  /** rótulo exibido no preview */
  label: string;
  /** sinônimos aceitos no cabeçalho (case-insensitive, sem acento) */
  aliases: string[];
  required?: boolean;
  /** transforma o valor cru da célula */
  transform?: (raw: string) => string | number | null;
  /** valida o valor já transformado; retorna null se ok ou mensagem de erro */
  validate?: (value: any, row: Record<string, any>) => string | null;
};

export type ParsedRow = {
  raw: Record<string, string>;
  values: Record<string, any>;
  errors: string[];
};

type Props = {
  trigger: React.ReactNode;
  title: string;
  description: string;
  columns: ColumnSpec[];
  /** chamado com as linhas válidas; deve retornar { inserted, updated, skipped } */
  onImport: (rows: ParsedRow[]) => Promise<{ inserted: number; updated: number; skipped: number }>;
  /** exemplo a baixar */
  sampleFilename: string;
  sampleHeader: string[];
  sampleRows: string[][];
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0, "|": 0 };
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
}

function splitCSVLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCSV(text: string, columns: ColumnSpec[]): { rows: ParsedRow[]; sep: string; header: string[]; mappingErrors: string[] } {
  // remove BOM
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], sep: ",", header: [], mappingErrors: ["Arquivo vazio."] };

  const sep = detectSeparator(clean);
  const header = splitCSVLine(lines[0], sep).map((h) => h.replace(/^["']|["']$/g, ""));
  const headerNorm = header.map(norm);

  // mapeia coluna canônica -> índice
  const idx: Record<string, number> = {};
  const mappingErrors: string[] = [];
  for (const col of columns) {
    const aliases = [col.key, col.label, ...col.aliases].map(norm);
    const found = headerNorm.findIndex((h) => aliases.includes(h));
    if (found >= 0) idx[col.key] = found;
    else if (col.required) mappingErrors.push(`Coluna obrigatória "${col.label}" não encontrada (aceita: ${[col.label, ...col.aliases].join(", ")}).`);
  }

  if (mappingErrors.length) return { rows: [], sep, header, mappingErrors };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i], sep);
    const raw: Record<string, string> = {};
    const values: Record<string, any> = {};
    const errors: string[] = [];
    for (const col of columns) {
      const j = idx[col.key];
      const cell = j != null ? (cells[j] ?? "").replace(/^["']|["']$/g, "").trim() : "";
      raw[col.key] = cell;
      let v: any = cell;
      if (col.transform) v = col.transform(cell);
      values[col.key] = v;
    }
    for (const col of columns) {
      const v = values[col.key];
      if (col.required && (v === null || v === undefined || v === "")) {
        errors.push(`${col.label} obrigatório`);
      } else if (col.validate) {
        const err = col.validate(v, values);
        if (err) errors.push(err);
      }
    }
    rows.push({ raw, values, errors });
  }
  return { rows, sep, header, mappingErrors };
}

export function CsvImportDialog({ trigger, title, description, columns, onImport, sampleFilename, sampleHeader, sampleRows }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => (text.trim() ? parseCSV(text, columns) : null), [text, columns]);
  const valid = parsed?.rows.filter((r) => r.errors.length === 0) ?? [];
  const invalid = parsed?.rows.filter((r) => r.errors.length > 0) ?? [];

  const onFile = async (file: File) => {
    const buf = await file.text();
    setText(buf);
  };

  const downloadSample = () => {
    const csv = [sampleHeader.join(";"), ...sampleRows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = sampleFilename; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { setText(""); setBusy(false); };

  const doImport = async () => {
    if (!valid.length) { toast.error("Nenhuma linha válida para importar."); return; }
    setBusy(true);
    try {
      const res = await onImport(valid);
      toast.success(`Importação concluída: ${res.inserted} novos, ${res.updated} atualizados, ${res.skipped} ignorados.`);
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na importação");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium text-foreground">Formato aceito</div>
            <div>• Separador detectado automaticamente: <code>;</code>, <code>,</code>, <code>tab</code> ou <code>|</code>.</div>
            <div>• Primeira linha = cabeçalho. Aspas e BOM são tratados.</div>
            <div>• Colunas reconhecidas (qualquer um dos nomes):</div>
            <ul className="ml-4 list-disc">
              {columns.map((c) => (
                <li key={c.key}>
                  <span className="font-medium">{c.label}</span>
                  {c.required && <span className="text-destructive"> *</span>}
                  <span className="text-muted-foreground"> — {[c.label, ...c.aliases].join(" / ")}</span>
                </li>
              ))}
            </ul>
            <button onClick={downloadSample} className="text-primary underline mt-1">Baixar modelo CSV</button>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <label className="inline-flex">
                <input type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
                <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer hover:bg-muted">
                  <Upload className="h-4 w-4" /> Selecionar arquivo
                </span>
              </label>
              {text && <Badge variant="secondary"><FileText className="h-3 w-3 mr-1" />{(text.length / 1024).toFixed(1)} KB</Badge>}
              {text && <Button variant="ghost" size="sm" onClick={reset}>Limpar</Button>}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Ou cole aqui o conteúdo (ex.):\n${sampleHeader.join(";")}\n${sampleRows[0]?.join(";") ?? ""}`}
              className="font-mono text-xs min-h-[120px] rounded-md border bg-background p-2"
            />
          </div>

          {parsed?.mappingErrors.length ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {parsed.mappingErrors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          ) : null}

          {parsed && parsed.rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge className="bg-success/15 text-success border-0"><CheckCircle2 className="h-3 w-3 mr-1" />{valid.length} válidas</Badge>
                {invalid.length > 0 && <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />{invalid.length} com erro</Badge>}
              </div>
              <div className="max-h-[280px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 200).map((r, i) => (
                      <TableRow key={i} className={r.errors.length ? "bg-destructive/5" : ""}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        {columns.map((c) => <TableCell key={c.key} className="text-xs">{String(r.values[c.key] ?? "")}</TableCell>)}
                        <TableCell className="text-xs">
                          {r.errors.length === 0
                            ? <span className="text-success">OK</span>
                            : <span className="text-destructive">{r.errors.join("; ")}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsed.rows.length > 200 && (
                  <div className="p-2 text-center text-xs text-muted-foreground">…mostrando 200 de {parsed.rows.length} linhas. Todas serão processadas.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={doImport} disabled={busy || !valid.length}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Importar {valid.length > 0 ? `(${valid.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Helper compartilhado para normalizar nomes para fuzzy match */
export const normName = norm;
