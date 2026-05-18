import jsPDF from "jspdf";
import { toast } from "sonner";
import QRCode from "qrcode";
import logoUrl from "@/assets/spokenmed-logo.png";

// ===== Verificação / QR =====
export function gerarProtocolo(prefixo = "DOC"): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefixo}-${ts.slice(-6)}-${rand}`;
}

export async function buildQrDataUrl(text: string, size = 220): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin: 0,
      width: size,
      color: { dark: "#0f766e", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

/** Formata o conselho profissional (CRM, CRO, CRP, COREN, CRF, CRP, CREFITO, …) */
export function formatarConselho(
  p: { conselho_tipo?: string | null; conselho_numero?: string | null; conselho_uf?: string | null } | null | undefined,
): string | null {
  if (!p?.conselho_tipo || !p?.conselho_numero) return null;
  return `${p.conselho_tipo} ${p.conselho_numero}${p.conselho_uf ? "/" + p.conselho_uf : ""}`;
}

/** Formata o hash em grupos de 4: XXXX-XXXX-XXXX-... (até 32 chars hex) */
export function formatarAssinatura(hash: string | null | undefined): string {
  if (!hash) return "";
  const s = hash.replace(/[^0-9A-Fa-f]/g, "").toUpperCase().slice(0, 32);
  return s.match(/.{1,4}/g)?.join("-") ?? s;
}

export type VerificationOpts = {
  protocolo: string;
  qrDataUrl: string | null;
  verifyUrl?: string;
  assinatura?: string | null;
  assinadoEm?: string | null;
};

/**
 * Faixa do rodapé (acima do footer):
 *  - Cartão QR à DIREITA (sempre)
 *  - Cartão de Assinatura Eletrônica SpokenMED à ESQUERDA (quando informado)
 * Ambos cabem dentro de PDF_FOOTER_MARGIN, sem sobrepor conteúdo.
 */
export function drawVerificationBox(doc: jsPDF, opts: VerificationOpts) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ===== Cartão QR (direita) =====
  const qrBoxW = 170;
  const qrBoxH = 62;
  const qrX = pageW - 36 - qrBoxW;
  const qrY = pageH - 52 - qrBoxH - 6;

  doc.setDrawColor(...PDF_COLORS.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX, qrY, qrBoxW, qrBoxH, 6, 6, "FD");

  if (opts.qrDataUrl) {
    try { doc.addImage(opts.qrDataUrl, "PNG", qrX + 6, qrY + 6, qrBoxH - 12, qrBoxH - 12); } catch { /* ignore */ }
  }

  const tx = qrX + qrBoxH - 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text("VERIFICAÇÃO DE AUTENTICIDADE", tx, qrY + 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text("Protocolo:", tx, qrY + 22);
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(opts.protocolo, tx, qrY + 32);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...PDF_COLORS.muted);
  const url = opts.verifyUrl ?? VERIFY_DISPLAY;
  doc.text(url, tx, qrY + 42);
  doc.setTextColor(0, 0, 0);

  // ===== Cartão de Assinatura Eletrônica (esquerda) =====
  if (opts.assinatura) {
    const sigBoxW = 260;
    const sigBoxH = 62;
    const sigX = 36;
    const sigY = qrY;

    doc.setDrawColor(...PDF_COLORS.primary);
    doc.setLineWidth(0.7);
    doc.setFillColor(...PDF_COLORS.primarySoft);
    doc.roundedRect(sigX, sigY, sigBoxW, sigBoxH, 6, 6, "FD");
    doc.setLineWidth(0.5);

    // selo redondo
    const stampX = sigX + 26;
    const stampY = sigY + sigBoxH / 2;
    doc.setDrawColor(...PDF_COLORS.primaryDark);
    doc.setFillColor(...PDF_COLORS.primary);
    doc.circle(stampX, stampY, 18, "FD");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.text("SpokenMED", stampX, stampY - 3, { align: "center" });
    doc.setFontSize(6.5);
    doc.text("ASSINADO", stampX, stampY + 6, { align: "center" });

    const txtX = stampX + 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...PDF_COLORS.primaryDark);
    doc.text("ASSINATURA ELETRÔNICA SPOKENMED", txtX, sigY + 11);

    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.ink);
    const hashFmt = formatarAssinatura(opts.assinatura);
    const hashLines = doc.splitTextToSize(hashFmt, sigBoxW - (txtX - sigX) - 8);
    doc.text(hashLines.slice(0, 2), txtX, sigY + 22);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.6);
    doc.setTextColor(...PDF_COLORS.muted);
    const quando = opts.assinadoEm
      ? new Date(opts.assinadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
      : "";
    doc.text(`HMAC-SHA256 · ${quando}`, txtX, sigY + 42);
    doc.text("Assinatura eletrônica avançada — Lei 14.063/2020", txtX, sigY + 50);
    doc.text(`Verifique em ${VERIFY_DISPLAY}`, txtX, sigY + 58);
    doc.setTextColor(0, 0, 0);
  }
}

export function drawVerificationOnAllPages(doc: jsPDF, opts: VerificationOpts) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawVerificationBox(doc, opts);
  }
}


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

  return headerH + 12;
}

// Faixa reservada na base de cada página:
//   ~52pt para o footer (duas linhas) + ~68pt para o cartão QR/assinatura + folga.
// autoTable e checks de quebra DEVEM respeitar este valor.
export const PDF_FOOTER_MARGIN = 150;

// ===== Rodapé em todas as páginas (duas linhas, sem sobreposição) =====
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

    // régua superior do rodapé
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.5);
    doc.line(36, pageH - 50, pageW - 36, pageH - 50);

    // === Linha 1 — branding (acima) ===
    const brandY = pageH - 32;
    if (opts.logo) {
      const h = 14;
      const w = h * (opts.logo.w / opts.logo.h);
      try {
        doc.addImage(opts.logo.dataUrl, "PNG", 36, brandY - 11, w, h);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...PDF_COLORS.primary);
        doc.text("SpokenMED", 36 + w + 5, brandY - 1);
      } catch {
        /* ignore */
      }
    }
    // subtítulo do sistema, à direita da linha 1
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text("Sistema de Agendamento Médico", pageW - 36, brandY - 1, { align: "right" });

    // === Linha 2 — emissão + paginação (abaixo) ===
    const metaY = pageH - 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    const left = opts.emitidoPor
      ? `Emitido por ${opts.emitidoPor} · ${agora}`
      : `Emitido em ${agora}`;
    doc.text(left, 36, metaY);
    doc.text(`Página ${i} de ${totalPages}`, pageW - 36, metaY, { align: "right" });

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
    setTimeout(() => {
      try { win.document.title = filename; } catch { /* cross-origin no worker, ignore */ }
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
