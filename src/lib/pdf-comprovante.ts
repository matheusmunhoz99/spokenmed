import jsPDF from "jspdf";
import { formatCPF, formatPhone, formatTime } from "./format";
import { PDF_COLORS, drawHeader, drawFooterAllPages, drawVerificationOnAllPages, loadLogo, openPdf, PDF_FOOTER_MARGIN, gerarProtocolo, buildQrDataUrl } from "./pdf-shared";
import { buildVerifyUrl } from "./verificacao-url";
import { registrarDocumento } from "./documento-registry";

export type ComprovanteData = {
  codigo: string;
  data: string;
  hora: string;
  paciente: { nome: string; cpf?: string | null; telefone?: string | null; cns?: string | null };
  profissional: { nome: string; especialidade?: string | null; cbo?: string | null };
  unidade: { nome: string; endereco?: string | null; telefone?: string | null; cnes?: string | null };
  procedimento?: { codigo: string; nome: string } | null;
  motivo?: string | null;
  emitidoPor?: string;
};

const dataExtenso = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export async function gerarComprovante(c: ComprovanteData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;

  const logo = await loadLogo();
  let y = drawHeader(doc, {
    titulo: "Comprovante de Agendamento",
    subtitulo: "SpokenMED · Sistema de Agendamento Médico",
    logo,
  });

  // ===== Bloco Data/Horário em destaque =====
  y += 24;
  doc.setFillColor(...PDF_COLORS.primarySoft);
  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(0.8);
  doc.roundedRect(marginX, y, pageW - marginX * 2, 86, 8, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text("DATA E HORÁRIO DA CONSULTA", marginX + 18, y + 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...PDF_COLORS.ink);
  const dataTxt = dataExtenso(c.data);
  doc.text(dataTxt.charAt(0).toUpperCase() + dataTxt.slice(1), marginX + 18, y + 50);

  doc.setFontSize(28);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(formatTime(c.hora), pageW - marginX - 18, y + 58, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`Código: ${c.codigo.toUpperCase()}  ·  Consulte em /cidadao com este código + CPF`, marginX + 18, y + 72);

  y += 110;

  // ===== Cards stacked =====
  y = drawCard(doc, "PACIENTE", buildLines([
    ["Nome", c.paciente.nome],
    c.paciente.cpf ? ["CPF", formatCPF(c.paciente.cpf)] : null,
    c.paciente.cns ? ["Cartão SUS", c.paciente.cns] : null,
    c.paciente.telefone ? ["Telefone", formatPhone(c.paciente.telefone)] : null,
  ]), marginX, y, pageW - marginX * 2);

  y += 14;
  y = drawCard(doc, "PROFISSIONAL", buildLines([
    ["Nome", c.profissional.nome],
    c.profissional.especialidade ? ["Especialidade", c.profissional.especialidade] : null,
    c.profissional.cbo ? ["CBO", c.profissional.cbo] : null,
  ]), marginX, y, pageW - marginX * 2);

  y += 14;
  y = drawCard(doc, "UNIDADE DE ATENDIMENTO", buildLines([
    ["Local", c.unidade.nome],
    c.unidade.cnes ? ["CNES", c.unidade.cnes] : null,
    c.unidade.endereco ? ["Endereço", c.unidade.endereco] : null,
    c.unidade.telefone ? ["Telefone", formatPhone(c.unidade.telefone)] : null,
  ]), marginX, y, pageW - marginX * 2);

  if (c.procedimento) {
    y += 14;
    y = drawCard(doc, "PROCEDIMENTO (SIGTAP)", buildLines([
      ["Código", c.procedimento.codigo],
      ["Descrição", c.procedimento.nome],
    ]), marginX, y, pageW - marginX * 2);
  }

  if (c.motivo) {
    y += 14;
    y = drawCard(doc, "MOTIVO / OBSERVAÇÕES", [{ label: "", value: c.motivo, full: true }], marginX, y, pageW - marginX * 2);
  }

  // ===== Lembretes =====
  const pageH = doc.internal.pageSize.getHeight();
  const lembretesH = 64;
  if (y + 18 + lembretesH > pageH - PDF_FOOTER_MARGIN) {
    doc.addPage();
    y = drawHeader(doc, {
      titulo: "Comprovante de Agendamento",
      subtitulo: "SpokenMED · Sistema de Agendamento Médico",
      logo,
    });
  }
  y += 18;
  doc.setFillColor(...PDF_COLORS.warnBg);
  doc.setDrawColor(...PDF_COLORS.warnBorder);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginX, y, pageW - marginX * 2, lembretesH, 6, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.warnText);
  doc.text("LEMBRETES IMPORTANTES", marginX + 14, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("• Chegue com 15 minutos de antecedência. Traga documento com foto e Cartão SUS.", marginX + 14, y + 36);
  doc.text("• Em caso de impossibilidade, entre em contato com pelo menos 24h de antecedência.", marginX + 14, y + 52);

  const protocolo = gerarProtocolo("AGEN");
  const qr = await buildQrDataUrl(buildVerifyUrl(protocolo, { c: c.codigo }));
  drawVerificationOnAllPages(doc, { protocolo, qrDataUrl: qr });
  drawFooterAllPages(doc, { emitidoPor: c.emitidoPor, logo });
  await registrarDocumento({
    protocolo, tipo: "comprovante",
    paciente: { nome: c.paciente.nome, cpf: c.paciente.cpf },
    profissional: { nome: c.profissional.nome, cbo: c.profissional.cbo },
    unidade: { nome: c.unidade.nome, cnes: c.unidade.cnes },
    metadata: { codigo: c.codigo, data: c.data, hora: c.hora },
  });
  openPdf(doc, `comprovante_${c.codigo.slice(0, 8)}.pdf`);
}

type CardLine = { label: string; value: string; full?: boolean };

function buildLines(rows: (readonly [string, string] | null)[]): CardLine[] {
  return rows.filter(Boolean).map((r) => ({ label: (r as any)[0], value: (r as any)[1] }));
}

function drawCard(
  doc: jsPDF,
  title: string,
  lines: CardLine[],
  x: number,
  y: number,
  w: number,
): number {
  const padding = 16;
  const titleH = 22;
  const rowH = 36;
  let bodyH = padding;
  // calcula altura
  const rowsPerLine = lines.map((l) => {
    if (l.full) {
      const wrapped = doc.splitTextToSize(l.value, w - padding * 2);
      return { wrapped, h: 18 + wrapped.length * 12 };
    }
    return { wrapped: [l.value], h: rowH };
  });
  bodyH += rowsPerLine.reduce((s, r) => s + r.h, 0);
  bodyH += 4;
  const totalH = titleH + bodyH;

  // card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, w, totalH, 8, 8, "FD");

  // title bar
  doc.setFillColor(...PDF_COLORS.surface);
  doc.roundedRect(x, y, w, titleH, 8, 8, "F");
  // tampa cantos inferiores
  doc.rect(x, y + titleH - 6, w, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(title, x + padding, y + 14);

  // linhas
  let cy = y + titleH + padding;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const r = rowsPerLine[i];
    if (l.full) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(r.wrapped, x + padding, cy + 4);
      cy += r.h;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...PDF_COLORS.muted);
      doc.text(l.label.toUpperCase(), x + padding, cy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(l.value, x + padding, cy + 16);
      cy += rowH;
    }
  }
  return y + totalH;
}
