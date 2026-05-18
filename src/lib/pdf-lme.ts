import jsPDF from "jspdf";
import { drawHeader, drawFooterAllPages, drawVerificationOnAllPages, loadLogo, openPdf, PDF_COLORS, PDF_FOOTER_MARGIN, gerarProtocolo, buildQrDataUrl } from "./pdf-shared";
import { registrarDocumento } from "./documento-registry";

export type LmeOpts = {
  paciente: { nome: string; cpf?: string; cns?: string; sexo?: string; dn?: string; raca?: string; telefone?: string; endereco?: string; mae?: string };
  profissional: { nome: string; crm?: string; uf?: string; cbo?: string };
  unidade?: { nome?: string; cnes?: string };
  cid10?: string;
  diagnostico?: string;
  medicamentos: { nome: string; apresentacao?: string; posologia: string; qtd?: string }[];
  anamnese?: string;
  examesPrevios?: string;
  tempoTratamento?: string;
  usuarioNome?: string;
};

function dataExt() {
  return new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

function section(doc: jsPDF, num: number, title: string, x: number, y: number, w: number) {
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(x, y, 22, 16, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(String(num), x + 11, y + 12, { align: "center" });
  doc.setFillColor(...PDF_COLORS.primarySoft);
  doc.rect(x + 22, y, w - 22, 16, "F");
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFontSize(9);
  doc.text(title.toUpperCase(), x + 30, y + 12);
  doc.setTextColor(...PDF_COLORS.ink);
}

function field(doc: jsPDF, label: string, value: string, x: number, y: number, w: number) {
  doc.setDrawColor(...PDF_COLORS.border);
  doc.rect(x, y, w, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(label.toUpperCase(), x + 4, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  const lines = doc.splitTextToSize(value || "—", w - 8);
  doc.text(lines.slice(0, 1), x + 4, y + 22);
}

export async function gerarLmePdf(opts: LmeOpts) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const logo = await loadLogo();

  let y = drawHeader(doc, {
    titulo: "LME — Componente Especializado",
    subtitulo: "Laudo para Solicitação, Avaliação e Autorização de Medicamentos",
    logo,
  });

  const marginX = 36;
  const fullW = pageW - marginX * 2;

  // 1) Paciente
  section(doc, 1, "Identificação do paciente", marginX, y, fullW);
  y += 20;
  field(doc, "Nome completo", opts.paciente.nome, marginX, y, fullW);
  y += 32;
  const half = (fullW - 8) / 2;
  field(doc, "CNS", opts.paciente.cns ?? "", marginX, y, half);
  field(doc, "CPF", opts.paciente.cpf ?? "", marginX + half + 8, y, half);
  y += 32;
  const third = (fullW - 16) / 3;
  field(doc, "Data nasc.", opts.paciente.dn ?? "", marginX, y, third);
  field(doc, "Sexo", opts.paciente.sexo ?? "", marginX + third + 8, y, third);
  field(doc, "Raça/Cor", opts.paciente.raca ?? "", marginX + (third + 8) * 2, y, third);
  y += 32;
  field(doc, "Nome da mãe", opts.paciente.mae ?? "", marginX, y, fullW);
  y += 32;
  field(doc, "Endereço", opts.paciente.endereco ?? "", marginX, y, fullW - 140);
  field(doc, "Telefone", opts.paciente.telefone ?? "", marginX + fullW - 132, y, 132);
  y += 40;

  // 2) Diagnóstico
  section(doc, 2, "Diagnóstico", marginX, y, fullW);
  y += 20;
  field(doc, "CID-10", opts.cid10 ?? "", marginX, y, 120);
  field(doc, "Descrição diagnóstica", opts.diagnostico ?? "", marginX + 128, y, fullW - 128);
  y += 40;

  // 3) Medicamentos
  section(doc, 3, "Medicamento(s) solicitado(s)", marginX, y, fullW);
  y += 20;
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setFillColor(...PDF_COLORS.surface);
  doc.rect(marginX, y, fullW, 18, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text("DCB / NOME — APRESENTAÇÃO", marginX + 6, y + 12);
  doc.text("POSOLOGIA", marginX + fullW * 0.55, y + 12);
  doc.text("QTD/MÊS", marginX + fullW - 70, y + 12);
  y += 18;
  opts.medicamentos.forEach((m) => {
    doc.setDrawColor(...PDF_COLORS.border);
    doc.rect(marginX, y, fullW, 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.ink);
    const nome = `${m.nome}${m.apresentacao ? " — " + m.apresentacao : ""}`;
    doc.text(doc.splitTextToSize(nome, fullW * 0.55 - 12), marginX + 6, y + 14);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(m.posologia || "—", fullW * 0.40 - 80), marginX + fullW * 0.55, y + 14);
    doc.text(m.qtd ?? "—", marginX + fullW - 35, y + 14, { align: "center" });
    y += 24;
  });
  if (opts.medicamentos.length === 0) {
    doc.setDrawColor(...PDF_COLORS.border);
    doc.rect(marginX, y, fullW, 24);
    y += 24;
  }
  y += 8;
  field(doc, "Tempo de tratamento previsto", opts.tempoTratamento ?? "", marginX, y, fullW);
  y += 40;

  // 4) Anamnese
  section(doc, 4, "Anamnese", marginX, y, fullW);
  y += 20;
  doc.setDrawColor(...PDF_COLORS.border);
  doc.rect(marginX, y, fullW, 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  const anamLines = doc.splitTextToSize(opts.anamnese || "—", fullW - 12);
  doc.text(anamLines.slice(0, 6), marginX + 6, y + 14);
  y += 100;

  // 5) Exames complementares
  if (y > pageH - PDF_FOOTER_MARGIN - 200) { doc.addPage(); y = 60; }
  section(doc, 5, "Exames complementares / observações", marginX, y, fullW);
  y += 20;
  doc.setDrawColor(...PDF_COLORS.border);
  doc.rect(marginX, y, fullW, 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  const exLines = doc.splitTextToSize(opts.examesPrevios || "—", fullW - 12);
  doc.text(exLines.slice(0, 4), marginX + 6, y + 14);
  y += 80;

  // 6) Médico solicitante
  section(doc, 6, "Médico solicitante", marginX, y, fullW);
  y += 20;
  field(doc, "Nome", opts.profissional.nome, marginX, y, fullW - 220);
  field(doc, "CRM/UF", `${opts.profissional.crm ?? ""}${opts.profissional.uf ? "/" + opts.profissional.uf : ""}`, marginX + fullW - 212, y, 100);
  field(doc, "CBO", opts.profissional.cbo ?? "", marginX + fullW - 108, y, 108);
  y += 40;

  // 7) Autorização (em branco — preenchida pela Farmácia)
  section(doc, 7, "Autorização (uso da Farmácia / SES)", marginX, y, fullW);
  y += 20;
  doc.setDrawColor(...PDF_COLORS.border);
  doc.rect(marginX, y, fullW, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text("Nº autorização: ________________________     Validade: __/__/____     Responsável: ________________________", marginX + 6, y + 18);
  doc.text("Assinatura/carimbo:", marginX + 6, y + 38);
  y += 60;

  // Assinatura
  const sigY = Math.min(y + 10, pageH - PDF_FOOTER_MARGIN - 50);
  doc.setDrawColor(...PDF_COLORS.ink);
  doc.line(pageW / 2 - 130, sigY, pageW / 2 + 130, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(opts.profissional.nome, pageW / 2, sigY + 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`${opts.unidade?.nome ?? "—"}, ${dataExt()}`, pageW / 2, sigY + 28, { align: "center" });

  const protocolo = gerarProtocolo("LME");
  const qr = await buildQrDataUrl(buildVerifyUrl(protocolo));
  drawVerificationOnAllPages(doc, { protocolo, qrDataUrl: qr });
  drawFooterAllPages(doc, { logo, emitidoPor: opts.usuarioNome });
  await registrarDocumento({
    protocolo, tipo: "lme",
    paciente: { nome: opts.paciente.nome, cpf: opts.paciente.cpf },
    profissional: opts.profissional,
    unidade: { nome: opts.unidade?.nome, cnes: opts.unidade?.cnes },
    metadata: { cid: opts.cid10, qtd_meds: opts.medicamentos.length },
  });
  openPdf(doc, `lme-${opts.paciente.nome.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
