import jsPDF from "jspdf";
import { toast } from "sonner";
import logoUrl from "@/assets/spokenmed-logo.png";

// ===== Paleta (alinhada ao teal do site) =====
export const PDF_COLORS = {
  primary: [15, 118, 110] as [number, number, number],          // teal-700
  primaryDark: [11, 93, 87] as [number, number, number],        // teal-800
  primarySoft: [204, 251, 241] as [number, number, number],     // teal-100
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  warnBg: [254, 243, 199] as [number, number, number],
  warnBorder: [252, 211, 77] as [number, number, number],
  warnText: [146, 64, 14] as [number, number, number],
  status: {
    agendado: [204, 251, 241, 11, 93, 87] as [number, number, number, number, number, number],
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

// ===== Cabeçalho com painel branco do logo =====
export function drawHeader(
  doc: jsPDF,
  opts: { titulo: string; subtitulo?: string; logo: Awaited<ReturnType<typeof loadLogo>> },
) {
  const pageW = doc.internal.pageSize.getWidth();
  const headerH = 100;

  // faixa principal teal
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(0, 0, pageW, headerH, "F");

  // banda inferior mais escura
  doc.setFillColor(...PDF_COLORS.primaryDark);
  doc.rect(0, headerH, pageW, 4, "F");

  // ===== Painel branco para o logo =====
  const panelX = 32;
  const panelY = 18;
  const panelW = 168;
  const panelH = 64;

  // sombra sutil
  doc.setFillColor(0, 0, 0);
  doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
  doc.roundedRect(panelX + 1.5, panelY + 2.5, panelW, panelH, 10, 10, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  // painel
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(panelX, panelY, panelW, panelH, 10, 10, "F");

  // logo dentro do painel (fit com padding)
  if (opts.logo) {
    const padX = 14;
    const padY = 6;
    const maxW = panelW - padX * 2;
    const maxH = panelH - padY * 2;
    const ratio = opts.logo.w / opts.logo.h;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    const ix = panelX + (panelW - w) / 2;
    const iy = panelY + (panelH - h) / 2;
    try {
      doc.addImage(opts.logo.dataUrl, "PNG", ix, iy, w, h);
    } catch {
      /* ignore */
    }
  }

  // título à direita
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(opts.titulo, pageW - 36, 50, { align: "right" });
  if (opts.subtitulo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(220, 252, 245);
    doc.text(opts.subtitulo, pageW - 36, 70, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);

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
    doc.line(36, pageH - 40, pageW - 36, pageH - 40);

    // mini-logo + nome
    const baseY = pageH - 24;
    if (opts.logo) {
      const h = 14;
      const w = h * (opts.logo.w / opts.logo.h);
      try {
        doc.addImage(opts.logo.dataUrl, "PNG", 36, baseY - 11, w, h);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...PDF_COLORS.primary);
        doc.text("SpokenMED", 36 + w + 4, baseY - 1);
      } catch {
        /* ignore */
      }
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);

    const left = opts.emitidoPor
      ? `Emitido por ${opts.emitidoPor} · ${agora}`
      : `Emitido em ${agora}`;
    doc.text(left, pageW / 2, baseY - 1, { align: "center" });

    doc.text(`Página ${i} de ${totalPages}`, pageW - 36, baseY - 1, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }
}

// ===== Abre o PDF em nova aba (preview) com fallback para download =====
export function openPdf(doc: jsPDF, filename: string) {
  try {
    const url = doc.output("bloburl") as unknown as string;
    const win = window.open(url, "_blank");
    if (!win) {
      doc.save(filename);
      toast.info("Permita pop-ups para visualizar antes de imprimir.", {
        description: "PDF baixado como alternativa.",
      });
      return;
    }
    // tenta dar um título amigável na aba
    setTimeout(() => {
      try {
        win.document.title = filename;
      } catch {
        /* cross-origin no worker, ignore */
      }
    }, 500);
  } catch {
    doc.save(filename);
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
