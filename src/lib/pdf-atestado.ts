import jsPDF from "jspdf";
import { drawHeader, drawFooterAllPages, drawVerificationOnAllPages, loadLogo, openPdf, PDF_COLORS, PDF_FOOTER_MARGIN, gerarProtocolo, buildQrDataUrl } from "./pdf-shared";
import { registrarDocumento } from "./documento-registry";

export type AtestadoOpts = {
  paciente: { nome: string; cpf?: string; cns?: string };
  profissional: { nome: string; crm?: string; uf?: string; cbo?: string };
  unidade?: { nome?: string; cnes?: string };
  dias: number;
  cid?: string;
  mencionarCid: boolean;
  repouso: boolean;
  observacoes?: string;
  usuarioNome?: string;
};

function dataExt() {
  return new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

export async function gerarAtestadoPdf(opts: AtestadoOpts) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const logo = await loadLogo();
  let y = drawHeader(doc, { titulo: "Atestado Médico", subtitulo: opts.unidade?.nome ?? "", logo });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("ATESTADO MÉDICO", pageW / 2, y + 30, { align: "center" });
  y += 60;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.ink);

  const cidTrecho = opts.mencionarCid && opts.cid ? ` (CID-10 ${opts.cid})` : "";
  const repouso = opts.repouso ? ", devendo permanecer em repouso domiciliar" : "";
  const corpo = `Atesto, para os devidos fins, que o(a) Sr(a). ${opts.paciente.nome}${opts.paciente.cpf ? `, inscrito(a) no CPF ${opts.paciente.cpf}` : ""}${opts.paciente.cns ? ` e CNS ${opts.paciente.cns}` : ""}, esteve sob meus cuidados profissionais nesta data, necessitando de afastamento de suas atividades habituais pelo período de ${opts.dias} (${porExtenso(opts.dias)}) dia(s)${repouso}${cidTrecho}.`;
  const lines = doc.splitTextToSize(corpo, pageW - 80);
  doc.text(lines, 40, y, { lineHeightFactor: 1.6 });
  y += lines.length * 20 + 20;

  if (opts.observacoes?.trim()) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLORS.muted);
    const ol = doc.splitTextToSize(opts.observacoes, pageW - 80);
    doc.text(ol, 40, y, { lineHeightFactor: 1.5 });
    y += ol.length * 18 + 20;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(`${opts.unidade?.nome ?? "Local"}, ${dataExt()}.`, 40, y);

  // assinatura
  const sigY = pageH - PDF_FOOTER_MARGIN - 70;
  doc.setDrawColor(...PDF_COLORS.ink);
  doc.line(pageW / 2 - 130, sigY, pageW / 2 + 130, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(opts.profissional.nome, pageW / 2, sigY + 16, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  const meta = [
    opts.profissional.crm ? `CRM ${opts.profissional.crm}${opts.profissional.uf ? "/" + opts.profissional.uf : ""}` : null,
    opts.profissional.cbo ? `CBO ${opts.profissional.cbo}` : null,
    opts.unidade?.cnes ? `CNES ${opts.unidade.cnes}` : null,
  ].filter(Boolean).join("   ·   ");
  if (meta) doc.text(meta, pageW / 2, sigY + 30, { align: "center" });
  doc.setFontSize(8);
  doc.text("Documento assinado digitalmente conforme MP 2.200-2/2001 (ICP-Brasil)", pageW / 2, sigY + 44, { align: "center" });

  const protocolo = gerarProtocolo("ATEST");
  const qr = await buildQrDataUrl(buildVerifyUrl(protocolo));
  drawVerificationOnAllPages(doc, { protocolo, qrDataUrl: qr });
  drawFooterAllPages(doc, { logo, emitidoPor: opts.usuarioNome });
  await registrarDocumento({
    protocolo, tipo: "atestado",
    paciente: { nome: opts.paciente.nome, cpf: opts.paciente.cpf },
    profissional: opts.profissional,
    unidade: { nome: opts.unidade?.nome, cnes: opts.unidade?.cnes },
    metadata: { dias: opts.dias, cid: opts.cid ?? null, mencionarCid: opts.mencionarCid, repouso: opts.repouso },
  });
  openPdf(doc, `atestado-${opts.paciente.nome.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

const NUMS = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez",
  "onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove","vinte",
  "vinte e um","vinte e dois","vinte e três","vinte e quatro","vinte e cinco","vinte e seis","vinte e sete","vinte e oito","vinte e nove","trinta"];
function porExtenso(n: number) { return NUMS[n] ?? String(n); }
