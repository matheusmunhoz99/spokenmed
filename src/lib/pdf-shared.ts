import jsPDF from "jspdf";
import logoUrl from "@/assets/spokenmed-logo.png";

// ===== Paleta =====
export const PDF_COLORS = {
  primary: [37, 99, 235] as [number, number, number],
  primaryDark: [29, 78, 216] as [number, number, number],
  primarySoft: [219, 234, 254] as [number, number, number],
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  warnBg: [254, 243, 199] as [number, number, number],
  warnBorder: [252, 211, 77] as [number, number, number],
  warnText: [120, 53, 15] as [number, number, number],
  status: {
    agendado: [219, 234, 254, 30, 64, 175] as [number, number, number, number, number, number],
    confirmado: [220, 252, 231, 22, 101, 52] as [number, number, number, number, number, number],
    atendido: [219, 234, 254, 30, 64, 175] as [number, number, number, number, number, number],
    faltou: [254, 226, 226, 153, 27, 27] as [number, number, number, number, number, number],
    cancelado: [241, 245, 249, 71, 85, 105] as [number, number, number, number, number, number],
  } as Record<string, [number, number, number, number, number, number]>,
};

// ===== Logo (cache) =====
type LogoData = { dataUrl: string; w: number; h: number } | null;
let logoCache: LogoData = null;
let logoPromise: Promise<LogoData> | null = null;

export async function loadLogo(): Promise<LogoData> {
  if (logoCache) return logoCache;
  if (logoPromise) return logoPromise;
  logoPromise = (async () => {
    try {
      const res = await fetch(logoUrl);
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const dims: { w: number; h: number } = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 1, h: 1 });
        img.src = dataUrl;
      });
      logoCache = { dataUrl, w: dims.w, h: dims.h };
      return logoCache;
    } catch {
      return null;
    }
  })();
  return logoPromise;
}

// ===== Cabeçalho =====
export function drawHeader(
  doc: jsPDF,
  opts: { titulo: string; subtitulo?: string; logo: Awaited<ReturnType<typeof loadLogo>> },
) {
  const pageW = doc.internal.pageSize.getWidth();
  const headerH = 84;

  // faixa
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(0, 0, pageW, headerH, "F");

  // sutil banda inferior mais escura
  doc.setFillColor(...PDF_COLORS.primaryDark);
  doc.rect(0, headerH, pageW, 4, "F");

  // logo
  if (opts.logo) {
    const targetH = 44;
    const ratio = opts.logo.w / opts.logo.h;
    const targetW = targetH * ratio;
    try {
      doc.addImage(opts.logo.dataUrl, "PNG", 36, (headerH - targetH) / 2, targetW, targetH);
    } catch {
      /* ignore */
    }
  }

  // título à direita
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(opts.titulo, pageW - 36, 38, { align: "right" });
  if (opts.subtitulo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(opts.subtitulo, pageW - 36, 58, { align: "right" });
  }
  doc.setTextColor(0);

  return headerH + 4;
}

// ===== Rodapé em todas as páginas =====
export function drawFooterAllPages(
  doc: jsPDF,
  opts: { emitidoPor?: string; logo: Awaited<ReturnType<typeof loadLogo>> },
) {
  const totalPages = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const agora = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.5);
    doc.line(36, pageH - 38, pageW - 36, pageH - 38);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);

    const left = opts.emitidoPor
      ? `Emitido por ${opts.emitidoPor} · ${agora}`
      : `Emitido em ${agora}`;
    doc.text(left, 36, pageH - 22);

    doc.text("SpokenMED · Sistema de Agendamento Médico", pageW / 2, pageH - 22, {
      align: "center",
    });

    doc.text(`Página ${i} de ${totalPages}`, pageW - 36, pageH - 22, { align: "right" });
    doc.setTextColor(0);
  }
}

// ===== Status chip (para agenda) =====
export const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  atendido: "Atendido",
  faltou: "Faltou",
  cancelado: "Cancelado",
};
