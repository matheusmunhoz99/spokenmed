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

export type ReceitaTipo =
  | "comum"
  | "controle_especial"
  | "antimicrobiano"
  | "notificacao_a"   // AMARELA — entorpecentes / psicotrópicos A1/A2/A3 (Venvanse, Ritalina, morfina)
  | "notificacao_b";  // AZUL — psicotrópicos B1/B2 (Rivotril, Stilnox)

export type GerarReceitaOpts = {
  tipo: ReceitaTipo;
  paciente: { nome: string; cpf?: string; cns?: string; endereco?: string };
  profissional: { nome: string; crm?: string; uf?: string; cbo?: string; conselho_tipo?: string };
  unidade?: { nome?: string; cnes?: string; endereco?: string; telefone?: string };
  medicamentos: ReceitaMed[];
  orientacoes?: string;
  usuarioNome?: string;
  notificacao?: { numero: string; uf_emissao: string; validade_dias?: number };
  comprador?: { nome?: string; rg?: string; endereco?: string };
};

const TIPO_LABEL: Record<ReceitaTipo, string> = {
  comum: "Receituário Comum",
  controle_especial: "Receituário de Controle Especial",
  antimicrobiano: "Receita de Antimicrobiano",
  notificacao_a: "Notificação de Receita A",
  notificacao_b: "Notificação de Receita B",
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

// ===== Notificação de Receita A (amarela) / B (azul) — Portaria SVS/MS 344/98 =====
function numeroPorExtenso(qtd: string): string {
  const n = parseInt(qtd.replace(/\D/g, ""), 10);
  if (!n || isNaN(n)) return "";
  const u = ["zero","uma","duas","três","quatro","cinco","seis","sete","oito","nove","dez",
    "onze","doze","treze","catorze","quinze","dezesseis","dezessete","dezoito","dezenove","vinte"];
  if (n <= 20) return u[n];
  if (n < 100) {
    const d = ["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
    return n % 10 === 0 ? d[Math.floor(n/10)] : `${d[Math.floor(n/10)]} e ${u[n%10]}`;
  }
  return String(n);
}

function drawNotificacao(
  doc: jsPDF,
  opts: GerarReceitaOpts,
  variante: "A" | "B",
  viaLabel: string,
  logo: any,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cor: [number, number, number] = variante === "A" ? [255, 247, 204] : [214, 230, 255];
  const corBorda: [number, number, number] = variante === "A" ? [204, 168, 0] : [37, 99, 235];

  // Fundo colorido em toda a página
  doc.setFillColor(...cor);
  doc.rect(0, 0, pageW, pageH, "F");

  // Faixa título
  doc.setFillColor(...corBorda);
  doc.rect(0, 0, pageW, 56, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(`NOTIFICAÇÃO DE RECEITA ${variante}`, 36, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    variante === "A"
      ? "Entorpecentes e psicotrópicos — Listas A1, A2 e A3 (Portaria 344/98 SVS/MS)"
      : "Psicotrópicos — Listas B1 e B2 (Portaria 344/98 SVS/MS)",
    36, 42,
  );

  // Número sequencial (faixa direita)
  const numero = opts.notificacao?.numero || "________";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Nº ${numero}`, pageW - 36, 30, { align: "right" });
  doc.setFontSize(8);
  doc.text(viaLabel, pageW - 36, 46, { align: "right" });

  doc.setTextColor(0, 0, 0);
  let y = 80;

  // Identificação do emitente (obrigatório)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...corBorda);
  doc.setLineWidth(0.8);
  doc.roundedRect(36, y, pageW - 72, 64, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...corBorda);
  doc.text("IDENTIFICAÇÃO DO EMITENTE", 44, y + 12);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(opts.profissional.nome, 44, y + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const emitMeta: string[] = [];
  if (opts.profissional.crm) emitMeta.push(`CRM ${opts.profissional.crm}${opts.profissional.uf ? "/" + opts.profissional.uf : ""}`);
  if (opts.profissional.cbo) emitMeta.push(`CBO ${opts.profissional.cbo}`);
  doc.text(emitMeta.join("   ·   "), 44, y + 38);
  const unidLinha: string[] = [];
  if (opts.unidade?.nome) unidLinha.push(opts.unidade.nome);
  if (opts.unidade?.endereco) unidLinha.push(opts.unidade.endereco);
  if (opts.unidade?.telefone) unidLinha.push(`Tel: ${opts.unidade.telefone}`);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(doc.splitTextToSize(unidLinha.join("   ·   "), pageW - 96), 44, y + 50);
  y += 76;

  // Paciente
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(36, y, pageW - 72, 44, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...corBorda);
  doc.text("PACIENTE", 44, y + 12);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(opts.paciente.nome, 44, y + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const pacLinha: string[] = [];
  if (opts.paciente.cpf) pacLinha.push(`CPF ${opts.paciente.cpf}`);
  if (opts.paciente.cns) pacLinha.push(`CNS ${opts.paciente.cns}`);
  if (opts.paciente.endereco) pacLinha.push(opts.paciente.endereco);
  doc.text(pacLinha.join("   ·   ") || "—", 44, y + 38);
  y += 56;

  // Prescrição com quantidade por extenso
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...corBorda);
  doc.text("PRESCRIÇÃO", 36, y);
  y += 12;
  doc.setTextColor(0, 0, 0);
  opts.medicamentos.forEach((m, i) => {
    if (y > pageH - PDF_FOOTER_MARGIN - 140) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const titulo = `${i + 1}. ${m.nome}${m.apresentacao ? ` — ${m.apresentacao}` : ""}`;
    const tLines = doc.splitTextToSize(titulo, pageW - 90);
    doc.text(tLines, 36, y);
    y += tLines.length * 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(`Posologia: ${m.posologia || "conforme orientação"}`, 52, y);
    y += 12;
    if (m.qtd) {
      const ext = numeroPorExtenso(m.qtd);
      doc.text(`Quantidade: ${m.qtd}${ext ? ` (${ext})` : ""}`, 52, y);
      y += 12;
    }
    if (m.duracao) { doc.text(`Duração: ${m.duracao}`, 52, y); y += 12; }
    doc.setTextColor(0, 0, 0);
    y += 6;
  });

  if (opts.orientacoes?.trim()) {
    if (y > pageH - PDF_FOOTER_MARGIN - 120) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...corBorda);
    doc.text("ORIENTAÇÕES", 36, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    const oLines = doc.splitTextToSize(opts.orientacoes, pageW - 72);
    doc.text(oLines, 36, y);
    y += oLines.length * 11 + 8;
  }

  // Identificação do comprador
  if (y > pageH - PDF_FOOTER_MARGIN - 110) { doc.addPage(); y = 60; }
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...corBorda);
  doc.roundedRect(36, y, pageW - 72, 52, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...corBorda);
  doc.text("IDENTIFICAÇÃO DO COMPRADOR", 44, y + 12);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Nome: ${opts.comprador?.nome ?? "_________________________________________________"}`, 44, y + 26);
  doc.text(`RG: ${opts.comprador?.rg ?? "______________________"}    Endereço: ${opts.comprador?.endereco ?? "____________________________"}`, 44, y + 40);
  y += 60;

  // Identificação do fornecedor (farmácia)
  doc.roundedRect(36, y, pageW - 72, 36, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...corBorda);
  doc.text("IDENTIFICAÇÃO DO FORNECEDOR (FARMÁCIA)", 44, y + 12);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Nome do farmacêutico: ____________________   CRF: __________   Data: __/__/____", 44, y + 26);
  y += 48;

  // Assinatura + validade
  const sigY = y + 24;
  doc.setDrawColor(0, 0, 0);
  doc.line(pageW / 2 - 130, sigY, pageW / 2 + 130, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(opts.profissional.nome, pageW / 2, sigY + 12, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (opts.profissional.crm) {
    doc.text(`CRM ${opts.profissional.crm}${opts.profissional.uf ? "/" + opts.profissional.uf : ""}`, pageW / 2, sigY + 24, { align: "center" });
  }
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  const validade = opts.notificacao?.validade_dias ?? 30;
  const uf = opts.notificacao?.uf_emissao || opts.profissional.uf || "—";
  doc.text(
    `Validade: ${validade} dias a contar da data de emissão · Válida somente no estado de ${uf}`,
    pageW / 2, sigY + 38, { align: "center" },
  );
  doc.text(`Emitido em: ${dataExt()}`, pageW / 2, sigY + 50, { align: "center" });
}

export async function gerarReceitaPdf(opts: GerarReceitaOpts) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const logo = await loadLogo();
  const isNotif = opts.tipo === "notificacao_a" || opts.tipo === "notificacao_b";

  if (isNotif) {
    if (!opts.notificacao?.numero || !opts.notificacao?.uf_emissao) {
      throw new Error("Notificação de Receita requer número sequencial e UF de emissão.");
    }
    const variante = opts.tipo === "notificacao_a" ? "A" : "B";
    drawNotificacao(doc, opts, variante, "1ª via — Retenção em Farmácia", logo);
    doc.addPage();
    drawNotificacao(doc, opts, variante, "2ª via — Paciente", logo);
  } else {
    const duasVias = opts.tipo !== "comum";
    if (duasVias) {
      drawVia(doc, opts, "1ª via — Paciente", logo);
      doc.addPage();
      drawVia(doc, opts, "2ª via — Farmácia", logo);
    } else {
      drawVia(doc, opts, null, logo);
    }
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
    metadata: {
      tipo_receita: opts.tipo,
      qtd_medicamentos: opts.medicamentos.length,
      ...(opts.notificacao ? { notificacao_numero: opts.notificacao.numero, uf_emissao: opts.notificacao.uf_emissao } : {}),
    },
  });
  openPdf(doc, `receita-${opts.paciente.nome.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
