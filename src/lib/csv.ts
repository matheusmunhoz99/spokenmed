// Utilitário para download de CSV com BOM UTF-8 (compatível com Excel BR)
export type CsvColumn<T> = { header: string; get: (row: T) => unknown };

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const sep = ";"; // Excel BR usa ; como separador
  const head = columns.map((c) => escape(c.header)).join(sep);
  const body = rows.map((r) => columns.map((c) => escape(c.get(r))).join(sep)).join("\r\n");
  const csv = "\uFEFF" + head + "\r\n" + body; // BOM UTF-8

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
