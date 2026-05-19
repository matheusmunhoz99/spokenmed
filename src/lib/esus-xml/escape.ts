// Helpers de geração XML para fichas e-SUS (padrão dadoTransporteTransportXml).
export function escapeXml(s: string | number | bigint | boolean): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Renderiza <tag>valor</tag> só se valor não for null/undefined/"". */
export function tag(name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}>${escapeXml(value as any)}</${name}>`;
}

/** Renderiza múltiplas <tag> repetidas (uma por item não vazio). */
export function tagList(name: string, values: unknown[] | null | undefined): string {
  if (!values || !values.length) return "";
  return values.filter((v) => v !== null && v !== undefined && v !== "").map((v) => `<${name}>${escapeXml(v as any)}</${name}>`).join("");
}

export function digits(v: string | null | undefined): string | null {
  if (!v) return null;
  const c = String(v).replace(/\D/g, "");
  return c.length ? c : null;
}

/** epoch ms (UTC) para uma data YYYY-MM-DD ou Date. */
export function epochMs(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return Date.parse(d + "T00:00:00Z");
  }
  const x = typeof d === "string" ? new Date(d) : d;
  const t = x.getTime();
  return Number.isFinite(t) ? t : null;
}
