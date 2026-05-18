import jsPDF from "jspdf";
import { drawHeader, drawFooterAllPages, drawVerificationOnAllPages, loadLogo, openPdf, PDF_COLORS, PDF_FOOTER_MARGIN, gerarProtocolo, buildQrDataUrl } from "./pdf-shared";
import { buildVerifyUrl } from "./verificacao-url";
import { registrarDocumento } from "./documento-registry";

export type ReceitaMed = {
  nome: string;
  apresentacao?: string;
  posologia: string;
  qtd?: string;
  duracao?: string;
};

export type ReceitaTipo = "comum" | "controle_especial" | "antimicrobiano";

export type GerarReceitaOpts = {
  tipo: ReceitaTipo;
  paciente: { nome: string; cpf?: string; cns?: string; endereco?: string };
  profissional: { nome: string; crm?: string; uf?: string; cbo?: string };
  unidade?: { nome?: string; cnes?: string; endereco?: string };
  medicamentos: ReceitaMed[];
  orientacoes?: string;
  usuarioNome?: string;
};

const TIPO_LABEL: Record<ReceitaTipo, string> = {
  comum: "Receituário Comum",
  controle_especial: "Receituário de Controle Especial",
  antimicrobiano: "Receita de Antimicrobiano",
};

function dataExt() {
  return new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

function drawVia(doc: jsPDF, opts: GerarReceitaOpts, viaLabel: string | null, logo: any) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = drawHeader(doc, {
    titulo: TIPO_LABEL[opts.tipo],
    subtitulo: viaLabel ? `${viaLabel} · ${opts.unidade?.nome ?? ""}` : opts.unidade?.nome ?? "",
    logo,
  });

  // Bloco unidade
  doc.setFillColor(...PDF_COLORS.surface);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.roundedRect(36, y, pageW - 72, 42, 6, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(opts.unidade?.nome ?? "Unidade Básica de Saúde", 46, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  const linhaUnid: string[] = [];
  if (opts.unidade?.cnes) linhaUnid.push(`CNES ${opts.unidade.cnes}`);
  if (opts.unidade?.endereco) linhaUnid.push(opts.unidade.endereco);
  linhaUnid.push("SUS · Atenção Primária");
  doc.text(linhaUnid.join("  ·  "), 46, y + 30);
  y += 56;

  // Paciente
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("PACIENTE", 36, y);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.line(86, y - 3, pageW - 36, y - 3);
  y += 14;
  doc.setTextColor(...PDF_COLORS.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(opts.paciente.nome, 36, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  const pacLinha: string[] = [];
  if (opts.paciente.cns) pacLinha.push(`CNS ${opts.paciente.cns}`);
  if (opts.paciente.cpf) pacLinha.push(`CPF ${opts.paciente.cpf}`);
  if (opts.paciente.endereco) pacLinha.push(opts.paciente.endereco);
  doc.text(pacLinha.join("   ·   ") || "—", 36, y);
  y += 22;

  // Prescrição
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("PRESCRIÇÃO", 36, y);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.line(106, y - 3, pageW - 36, y - 3);
  y += 16;

  doc.setTextColor(...PDF_COLORS.ink);
  doc.setFontSize(11);
  opts.medicamentos.forEach((m, i) => {
    if (y > pageH - PDF_FOOTER_MARGIN - 80) {
      doc.addPage();
      y = 60;
    }
    doc.setFont("helvetica", "bold");
    const titulo = `${i + 1}.  ${m.nome}${m.apresentacao ? ` — ${m.apresentacao}` : ""}`;
    const tituloLines = doc.splitTextToSize(titulo, pageW - 90);
    doc.text(tituloLines, 36, y);
    y += tituloLines.length * 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.muted);
    const meta: string[] = [];
    meta.push(`Tomar: ${m.posologia || "conforme orientação"}`);
    if (m.qtd) meta.push(`Quantidade: ${m.qtd}`);
    if (m.duracao) meta.push(`Duração: ${m.duracao}`);
    const metaLines = doc.splitTextToSize(meta.join("   ·   "), pageW - 90);
    doc.text(metaLines, 52, y);
    y += metaLines.length * 12 + 10;
    doc.setTextColor(...PDF_COLORS.ink);
    doc.setFontSize(11);
  });

  // Orientações
  if (opts.orientacoes?.trim()) {
    if (y > pageH - PDF_FOOTER_MARGIN - 80) { doc.addPage(); y = 60; }
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text("ORIENTAÇÕES", 36, y);
    doc.line(116, y - 3, pageW - 36, y - 3);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.ink);
    const lines = doc.splitTextToSize(opts.orientacoes, pageW - 72);
    doc.text(lines, 36, y);
    y += lines.length * 12 + 10;
  }

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
  const profMeta = [
    opts.profissional.crm ? `CRM ${opts.profissional.crm}${opts.profissional.uf ? "/" + opts.profissional.uf : ""}` : null,
    opts.profissional.cbo ? `CBO ${opts.profissional.cbo}` : null,
  ].filter(Boolean).join("   ·   ");
  if (profMeta) doc.text(profMeta, pageW / 2, sigY + 28, { align: "center" });
  doc.setFontSize(8);
  doc.text(`Local e data: ${opts.unidade?.nome ?? "—"}, ${dataExt()}`, pageW / 2, sigY + 42, { align: "center" });
  doc.text("Documento assinado digitalmente conforme MP 2.200-2/2001 (ICP-Brasil)", pageW / 2, sigY + 54, { align: "center" });

  // Linha de recibo p/ controle especial / antimicrobiano (na via da farmácia)
  if (viaLabel?.toLowerCase().includes("farmácia")) {
    const rY = sigY + 70;
    doc.setDrawColor(...PDF_COLORS.border);
    doc.line(36, rY, pageW - 36, rY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text("IDENTIFICAÇÃO DO COMPRADOR / RECEBEDOR", 36, rY + 12);
    doc.setFont("helvetica", "normal");
    doc.text("Nome: ____________________________________________", 36, rY + 28);
    doc.text("RG: __________________   CPF: __________________   Data: __/__/____", 36, rY + 42);
  }
}

export async function gerarReceitaPdf(opts: GerarReceitaOpts) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const logo = await loadLogo();
  const duasVias = opts.tipo !== "comum";
  if (duasVias) {
    drawVia(doc, opts, "1ª via — Paciente", logo);
    doc.addPage();
    drawVia(doc, opts, "2ª via — Farmácia", logo);
  } else {
    drawVia(doc, opts, null, logo);
  }
  const protocolo = gerarProtocolo("RECT");
  const qr = await buildQrDataUrl(buildVerifyUrl(protocolo));
  drawVerificationOnAllPages(doc, { protocolo, qrDataUrl: qr });
  drawFooterAllPages(doc, { logo, emitidoPor: opts.usuarioNome });
  await registrarDocumento({
    protocolo, tipo: "receita",
    paciente: { nome: opts.paciente.nome, cpf: opts.paciente.cpf },
    profissional: opts.profissional,
    unidade: { nome: opts.unidade?.nome, cnes: opts.unidade?.cnes },
    metadata: { tipo_receita: opts.tipo, qtd_medicamentos: opts.medicamentos.length },
  });
  openPdf(doc, `receita-${opts.paciente.nome.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
