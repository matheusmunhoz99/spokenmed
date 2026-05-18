import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawHeader, drawFooterAllPages, drawVerificationOnAllPages, loadLogo, openPdf, PDF_COLORS, PDF_FOOTER_MARGIN, gerarProtocolo, buildQrDataUrl } from "./pdf-shared";
import { registrarDocumento } from "./documento-registry";

export type SadtOpts = {
  paciente: { nome: string; cpf?: string; cns?: string; sexo?: string; dn?: string; telefone?: string; endereco?: string };
  profissional: { nome: string; crm?: string; uf?: string; cbo?: string };
  unidade?: { nome?: string; cnes?: string; ine?: string };
  cidPrincipal?: { code: string; desc: string } | null;
  cidsSecundarios?: string[];
  hipotese?: string;
  indicacao?: string;
  carater: "eletivo" | "prioritario" | "urgente";
  exames: { grupo: string; item: string }[];
  usuarioNome?: string;
};

const CARATER: Record<SadtOpts["carater"], string> = {
  eletivo: "Eletivo",
  prioritario: "Prioritário",
  urgente: "Urgente",
};

function dataExt() {
  return new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

export async function gerarSadtPdf(opts: SadtOpts) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const logo = await loadLogo();

  let y = drawHeader(doc, {
    titulo: "Solicitação SADT",
    subtitulo: "Serviço Auxiliar de Diagnóstico e Terapia · SUS / SISREG",
    logo,
  });

  // Bloco solicitante
  doc.setFillColor(...PDF_COLORS.surface);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.roundedRect(36, y, pageW - 72, 56, 6, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("ESTABELECIMENTO SOLICITANTE", 46, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(opts.unidade?.nome ?? "—", 46, y + 30);
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  const u = [
    opts.unidade?.cnes ? `CNES ${opts.unidade.cnes}` : null,
    opts.unidade?.ine ? `INE ${opts.unidade.ine}` : null,
    `Caráter: ${CARATER[opts.carater]}`,
    `Data: ${dataExt()}`,
  ].filter(Boolean).join("   ·   ");
  doc.text(u, 46, y + 46);
  y += 70;

  // Paciente — duas colunas
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("IDENTIFICAÇÃO DO PACIENTE", 36, y);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.line(186, y - 3, pageW - 36, y - 3);
  y += 14;

  const drawField = (label: string, value: string, x: number, yy: number, w: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.ink);
    const lines = doc.splitTextToSize(value || "—", w);
    doc.text(lines, x, yy + 12);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.line(x, yy + 18, x + w, yy + 18);
  };

  drawField("Nome completo", opts.paciente.nome, 36, y, pageW - 72);
  y += 30;
  const colW = (pageW - 72 - 16) / 2;
  drawField("CNS", opts.paciente.cns ?? "", 36, y, colW);
  drawField("CPF", opts.paciente.cpf ?? "", 36 + colW + 16, y, colW);
  y += 30;
  const colW3 = (pageW - 72 - 32) / 3;
  drawField("Data de nasc.", opts.paciente.dn ?? "", 36, y, colW3);
  drawField("Sexo", opts.paciente.sexo ?? "", 36 + colW3 + 16, y, colW3);
  drawField("Telefone", opts.paciente.telefone ?? "", 36 + (colW3 + 16) * 2, y, colW3);
  y += 30;
  drawField("Endereço", opts.paciente.endereco ?? "", 36, y, pageW - 72);
  y += 30;

  // Hipótese / CID
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("HIPÓTESE DIAGNÓSTICA / CID-10", 36, y);
  doc.line(206, y - 3, pageW - 36, y - 3);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  const hip = opts.hipotese?.trim() || opts.cidPrincipal?.desc || "—";
  const cidLinha = [
    opts.cidPrincipal ? `Principal: ${opts.cidPrincipal.code}` : null,
    opts.cidsSecundarios?.length ? `Secundários: ${opts.cidsSecundarios.join(", ")}` : null,
  ].filter(Boolean).join("   ·   ");
  doc.text(doc.splitTextToSize(hip, pageW - 72), 36, y);
  y += 16;
  if (cidLinha) {
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(cidLinha, 36, y);
    y += 14;
  }
  y += 4;

  // Indicação clínica
  if (opts.indicacao?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text("INDICAÇÃO CLÍNICA", 36, y);
    doc.line(146, y - 3, pageW - 36, y - 3);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.ink);
    const lines = doc.splitTextToSize(opts.indicacao, pageW - 72);
    doc.text(lines, 36, y);
    y += lines.length * 12 + 8;
  }

  // Tabela de exames
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("EXAMES / PROCEDIMENTOS SOLICITADOS", 36, y);
  doc.line(286, y - 3, pageW - 36, y - 3);
  y += 8;

  autoTable(doc, {
    startY: y + 4,
    head: [["#", "Grupo", "Procedimento solicitado", "Qtd"]],
    body: opts.exames.map((e, i) => [String(i + 1), e.grupo, e.item, "1"]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, textColor: PDF_COLORS.ink as any, lineColor: PDF_COLORS.border as any },
    headStyles: { fillColor: PDF_COLORS.primary as any, textColor: [255, 255, 255], fontSize: 9 },
    alternateRowStyles: { fillColor: PDF_COLORS.surface as any },
    columnStyles: { 0: { cellWidth: 24, halign: "center" }, 1: { cellWidth: 110 }, 3: { cellWidth: 36, halign: "center" } },
    margin: { left: 36, right: 36, bottom: PDF_FOOTER_MARGIN + 80 },
  });

  // Assinatura
  const sigY = pageH - PDF_FOOTER_MARGIN - 60;
  doc.setDrawColor(...PDF_COLORS.ink);
  doc.line(pageW / 2 - 130, sigY, pageW / 2 + 130, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(opts.profissional.nome, pageW / 2, sigY + 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  const meta = [
    opts.profissional.crm ? `CRM ${opts.profissional.crm}${opts.profissional.uf ? "/" + opts.profissional.uf : ""}` : null,
    opts.profissional.cbo ? `CBO ${opts.profissional.cbo}` : null,
  ].filter(Boolean).join("   ·   ");
  if (meta) doc.text(meta, pageW / 2, sigY + 28, { align: "center" });
  doc.setFontSize(8);
  doc.text("Solicitação eletrônica · SISREG / eSUS PEC · Assinada digitalmente (ICP-Brasil)", pageW / 2, sigY + 42, { align: "center" });

  const protocolo = gerarProtocolo("SADT");
  const qr = await buildQrDataUrl(buildVerifyUrl(protocolo));
  drawVerificationOnAllPages(doc, { protocolo, qrDataUrl: qr });
  drawFooterAllPages(doc, { logo, emitidoPor: opts.usuarioNome });
  await registrarDocumento({
    protocolo, tipo: "sadt",
    paciente: { nome: opts.paciente.nome, cpf: opts.paciente.cpf },
    profissional: opts.profissional,
    unidade: { nome: opts.unidade?.nome, cnes: opts.unidade?.cnes },
    metadata: { qtd_exames: opts.exames.length, carater: opts.carater },
  });
  openPdf(doc, `sadt-${opts.paciente.nome.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
