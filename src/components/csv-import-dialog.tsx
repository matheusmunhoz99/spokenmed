import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X, Download, Pause } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";

/**
 * Importação genérica via CSV/TSV/planilha colada.
 * - Detecta separador: ; , \t |
 * - Aceita BOM, aspas simples/duplas
 * - Faz match flexível de cabeçalho por sinônimos
 * - Pré-visualiza linhas válidas/erros antes de gravar
 * - Processa em lotes com barra de progresso, cancelamento e relatório de erros
 */

export type ColumnSpec = {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
  transform?: (raw: string) => string | number | null;
  validate?: (value: any, row: Record<string, any>) => string | null;
};

export type ParsedRow = {
  /** número da linha no arquivo original (1-indexed, já contando cabeçalho) */
  lineNumber: number;
  raw: Record<string, string>;
  values: Record<string, any>;
  errors: string[];
};

export type BatchResult = {
  inserted: number;
  updated: number;
  skipped: number;
  /** erros por linha do lote: { lineNumber, message } */
  errors?: Array<{ lineNumber: number; message: string }>;
};

type Props = {
  trigger: React.ReactNode;
  title: string;
  description: string;
  columns: ColumnSpec[];
  /**
   * Recebe UM lote por vez. Retorna contagens + erros por linha.
   * Use sempre operações em massa (upsert/insert/update com .in()) para performance.
   */
  processBatch: (rows: ParsedRow[]) => Promise<BatchResult>;
  sampleFilename: string;
  sampleHeader: string[];
  sampleRows: string[][];
  /** linhas por lote (default 50) */
  batchSize?: number;
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
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/);
  // mantemos índice original mas filtramos vazias
  const indexed = lines
    .map((l, i) => ({ line: l, n: i + 1 }))
    .filter((x) => x.line.trim().length > 0);
  if (indexed.length === 0) return { rows: [], sep: ",", header: [], mappingErrors: ["Arquivo vazio."] };

  const sep = detectSeparator(clean);
  const header = splitCSVLine(indexed[0].line, sep).map((h) => h.replace(/^["']|["']$/g, ""));
  const headerNorm = header.map(norm);

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
  for (let i = 1; i < indexed.length; i++) {
    const cells = splitCSVLine(indexed[i].line, sep);
    const raw: Record<string, string> = {};
    const values: Record<string, any> = {};
    const errors: string[] = [];
    for (const col of columns) {
      const j = idx[col.key];
      const cell = j != null ? (cells[j] ?? "").replace(/^["']|["']$/g, "").trim() : "";
      raw[col.key] = cell;
      let v: any = cell;
      if (col.transform) {
        try { v = col.transform(cell); }
        catch (e: any) { errors.push(`${col.label}: ${e?.message ?? "erro de formato"}`); v = null; }
      }
      values[col.key] = v;
    }
    for (const col of columns) {
      const v = values[col.key];
      if (col.required && (v === null || v === undefined || v === "")) {
        errors.push(`${col.label} obrigatório`);
      } else if (col.validate && v !== null && v !== undefined && v !== "") {
        const err = col.validate(v, values);
        if (err) errors.push(`${col.label}: ${err}`);
      }
    }
    rows.push({ lineNumber: indexed[i].n, raw, values, errors });
  }
  return { rows, sep, header, mappingErrors };
}

type RunState = {
  total: number;
  done: number;
  inserted: number;
  updated: number;
  skipped: number;
  phase: string;
  errors: Array<{ lineNumber: number; message: string }>;
  startedAt: number;
};

export function CsvImportDialog({ trigger, title, description, columns, processBatch, sampleFilename, sampleHeader, sampleRows, batchSize = 50 }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  const parsed = useMemo(() => (text.trim() ? parseCSV(text, columns) : null), [text, columns]);
  const valid = parsed?.rows.filter((r) => r.errors.length === 0) ?? [];
  const invalid = parsed?.rows.filter((r) => r.errors.length > 0) ?? [];

  const onFile = async (file: File) => {
    try {
      const buf = await file.text();
      setText(buf);
    } catch (e: any) {
      toast.error(`Falha ao ler arquivo: ${e?.message ?? e}`);
    }
  };

  const downloadSample = () => {
    const csv = [sampleHeader.join(";"), ...sampleRows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = sampleFilename; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setText(""); setBusy(false); setRun(null); setDone(false); cancelRef.current = false;
  };

  const downloadErrorLog = () => {
    if (!run?.errors.length) return;
    downloadCsv(
      `erros-importacao-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`,
      run.errors,
      [
        { header: "Linha", get: (e) => e.lineNumber },
        { header: "Erro", get: (e) => e.message },
      ],
    );
  };

  const doImport = async () => {
    if (!valid.length) { toast.error("Nenhuma linha válida para importar."); return; }
    cancelRef.current = false;
    setBusy(true); setDone(false);

    // já registra os erros de validação como falhas da importação
    const initialErrors = invalid.map((r) => ({ lineNumber: r.lineNumber, message: r.errors.join("; ") }));
    const state: RunState = {
      total: valid.length,
      done: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      phase: "Iniciando…",
      errors: [...initialErrors],
      startedAt: Date.now(),
    };
    setRun({ ...state });

    const batches: ParsedRow[][] = [];
    for (let i = 0; i < valid.length; i += batchSize) batches.push(valid.slice(i, i + batchSize));

    try {
      for (let bi = 0; bi < batches.length; bi++) {
        if (cancelRef.current) {
          state.phase = `Cancelado em ${state.done} de ${state.total}`;
          setRun({ ...state });
          break;
        }
        const batch = batches[bi];
        state.phase = `Processando lote ${bi + 1} de ${batches.length} (linhas ${batch[0].lineNumber}–${batch[batch.length - 1].lineNumber})…`;
        setRun({ ...state });
        // cede a thread para a UI atualizar
        await new Promise((r) => setTimeout(r, 0));

        try {
          const res = await processBatch(batch);
          state.inserted += res.inserted ?? 0;
          state.updated += res.updated ?? 0;
          state.skipped += res.skipped ?? 0;
          if (res.errors?.length) state.errors.push(...res.errors);
        } catch (e: any) {
          // erro no lote inteiro: marca todas as linhas do lote como skipped
          state.skipped += batch.length;
          const msg = e?.message ?? String(e);
          for (const r of batch) state.errors.push({ lineNumber: r.lineNumber, message: `Lote falhou: ${msg}` });
        }
        state.done += batch.length;
        setRun({ ...state });
      }

      state.phase = cancelRef.current
        ? `Cancelado: ${state.inserted} novos, ${state.updated} atualizados, ${state.errors.length} com erro.`
        : `Concluído: ${state.inserted} novos, ${state.updated} atualizados, ${state.errors.length} com erro.`;
      setRun({ ...state });
      setDone(true);

      if (state.errors.length === 0) {
        toast.success(`Importação concluída: ${state.inserted} novos, ${state.updated} atualizados.`);
      } else {
        toast.warning(`Importação finalizada com ${state.errors.length} erro(s). Veja o relatório.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const pct = run ? Math.round((run.done / Math.max(1, run.total)) * 100) : 0;
  const elapsed = run ? Math.max(0, Math.round((Date.now() - run.startedAt) / 1000)) : 0;
  const eta = run && run.done > 0 && busy ? Math.round((elapsed / run.done) * (run.total - run.done)) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (busy) { toast.info("Aguarde o término ou clique em Cancelar."); return; }
      setOpen(o); if (!o) reset();
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!run && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <div className="font-medium text-foreground">Formato aceito</div>
              <div>• Separador detectado automaticamente: <code>;</code>, <code>,</code>, <code>tab</code> ou <code>|</code>.</div>
              <div>• Primeira linha = cabeçalho. Aspas e BOM são tratados.</div>
              <div>• Processamento em lotes de {batchSize} linhas para não travar a tela.</div>
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
          )}

          {!run && (
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
                {text && <Button variant="ghost" size="sm" onClick={() => setText("")}>Limpar</Button>}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Ou cole aqui o conteúdo (ex.):\n${sampleHeader.join(";")}\n${sampleRows[0]?.join(";") ?? ""}`}
                className="font-mono text-xs min-h-[120px] rounded-md border bg-background p-2"
              />
            </div>
          )}

          {parsed?.mappingErrors.length ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="font-medium mb-1">Não foi possível ler o cabeçalho:</div>
              {parsed.mappingErrors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          ) : null}

          {!run && parsed && parsed.rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <Badge className="bg-success/15 text-success border-0"><CheckCircle2 className="h-3 w-3 mr-1" />{valid.length} válidas</Badge>
                {invalid.length > 0 && <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />{invalid.length} com erro de validação</Badge>}
                <span className="text-xs text-muted-foreground">Total: {parsed.rows.length} linhas · {Math.ceil(valid.length / batchSize)} lote(s)</span>
              </div>
              <div className="max-h-[280px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Linha</TableHead>
                      {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 200).map((r, i) => (
                      <TableRow key={i} className={r.errors.length ? "bg-destructive/5" : ""}>
                        <TableCell className="text-muted-foreground font-mono text-xs">{r.lineNumber}</TableCell>
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

          {run && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {busy
                      ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      : done
                        ? <CheckCircle2 className="h-4 w-4 text-success" />
                        : <Pause className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-medium">{run.phase}</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{run.done}/{run.total} · {pct}%</span>
                </div>
                <Progress value={pct} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Decorrido: {elapsed}s {eta != null && busy && <>· estimado restante: ~{eta}s</>}</span>
                  <span>Lotes de {batchSize} linhas</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-md border bg-success/5 p-2">
                  <div className="text-xs text-muted-foreground">Novos</div>
                  <div className="font-semibold text-success">{run.inserted}</div>
                </div>
                <div className="rounded-md border bg-primary/5 p-2">
                  <div className="text-xs text-muted-foreground">Atualizados</div>
                  <div className="font-semibold text-primary">{run.updated}</div>
                </div>
                <div className="rounded-md border bg-destructive/5 p-2">
                  <div className="text-xs text-muted-foreground">Com erro</div>
                  <div className="font-semibold text-destructive">{run.errors.length}</div>
                </div>
              </div>

              {run.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Erros ({run.errors.length})</div>
                    <Button size="sm" variant="outline" onClick={downloadErrorLog}>
                      <Download className="h-3 w-3 mr-1" /> Baixar relatório
                    </Button>
                  </div>
                  <div className="max-h-[200px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Linha</TableHead>
                          <TableHead>Mensagem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {run.errors.slice(0, 100).map((e, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{e.lineNumber}</TableCell>
                            <TableCell className="text-xs text-destructive">{e.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {run.errors.length > 100 && (
                      <div className="p-2 text-center text-xs text-muted-foreground">…mostrando 100 de {run.errors.length}. Baixe o relatório para ver todos.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!run ? (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={doImport} disabled={!valid.length}>
                <Upload className="h-4 w-4 mr-2" />
                Importar {valid.length > 0 ? `(${valid.length})` : ""}
              </Button>
            </>
          ) : busy ? (
            <Button variant="destructive" onClick={() => { cancelRef.current = true; toast.info("Cancelando após o lote atual…"); }}>
              <X className="h-4 w-4 mr-2" /> Cancelar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={reset}>Nova importação</Button>
              <Button onClick={() => { reset(); setOpen(false); }}>Fechar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Helper compartilhado para normalizar nomes para fuzzy match */
export const normName = norm;
