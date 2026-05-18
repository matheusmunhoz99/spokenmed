import jsPDF from "jspdf";
import { drawHeader, drawFooterAllPages, drawVerificationOnAllPages, loadLogo, openPdf, PDF_COLORS, PDF_FOOTER_MARGIN, gerarProtocolo, buildQrDataUrl } from "./pdf-shared";
import { buildVerifyUrl } from "./verificacao-url";
import { tentarAssinar } from "./documento-registry";
import { hashConteudoClient } from "./assinatura-client";
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
  /** Para tipos notificacao_a/b: dados retornados por emitirReceita (servidor). */
  notificacao?: {
    numero: string;
    uf_emissao: string;
    validade_dias?: number;
    sequencia?: number;
    hash_conteudo?: string;
    assinatura?: string;
    assinatura_curta?: string;
    emitido_em?: string;
    status?: "valida" | "cancelada" | "utilizada" | "expirada";
  };
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
    opts.profissional.crm ? `${opts.profissional.conselho_tipo || "CRM"} ${opts.profissional.crm}${opts.profissional.uf ? "/" + opts.profissional.uf : ""}` : null,
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
  _logo: any,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // Cores institucionais sóbrias
  const corBorda: [number, number, number] = variante === "A" ? [201, 162, 39] : [27, 79, 140];
  const corBordaSoft: [number, number, number] = variante === "A" ? [253, 246, 217] : [228, 236, 247];
  const corBordaMid: [number, number, number] = variante === "A" ? [231, 199, 105] : [136, 168, 211];

  // Fundo branco institucional + faixa lateral fina colorida
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(...corBorda);
  doc.rect(0, 0, 4, pageH, "F");
  doc.rect(pageW - 4, 0, 4, pageH, "F");

  // ===== Cabeçalho institucional =====
  doc.setFillColor(...corBorda);
  doc.rect(0, 0, pageW, 52, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`NOTIFICAÇÃO DE RECEITA — TIPO ${variante}`, 36, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    variante === "A"
      ? "Portaria SVS/MS 344/98 · Listas A1, A2 e A3 (entorpecentes e psicotrópicos)"
      : "Portaria SVS/MS 344/98 · Listas B1 e B2 (psicotrópicos)",
    36, 40,
  );

  // Bloco "Nº" no canto superior direito, monoespaçado
  const numero = opts.notificacao?.numero || "________________";
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(255, 255, 255);
  const numW = 178;
  doc.roundedRect(pageW - 36 - numW, 8, numW, 36, 3, 3, "F");
  doc.setTextColor(...corBorda);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("Nº DA NOTIFICAÇÃO", pageW - 36 - numW + 10, 18);
  doc.setFont("courier", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(numero, pageW - 36 - numW + 10, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(100, 116, 139);
  doc.text(viaLabel, pageW - 36 - numW + 10, 40);

  doc.setTextColor(0, 0, 0);
  let y = 70;

  // Linha sub-cabeçalho: emissão + sequência
  const emitidoEm = opts.notificacao?.emitido_em
    ? new Date(opts.notificacao.emitido_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : dataExt();
  const seq = opts.notificacao?.sequencia != null ? `Sequência ${String(opts.notificacao.sequencia).padStart(6, "0")}` : null;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const subMeta = [`Série ${variante}`, seq, `Emitido em ${emitidoEm}`].filter(Boolean).join("  ·  ");
  doc.text(subMeta, 36, y);
  y += 16;

  const drawSectionBox = (title: string, h: number) => {
    doc.setDrawColor(...corBordaMid);
    doc.setLineWidth(0.4);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(36, y, pageW - 72, h, 3, 3, "S");
    // header da seção
    doc.setFillColor(...corBordaSoft);
    doc.roundedRect(36, y, pageW - 72, 14, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...corBorda);
    doc.text(title, 44, y + 10);
  };

  // ===== Identificação do emitente =====
  drawSectionBox("IDENTIFICAÇÃO DO EMITENTE", 62);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(opts.profissional.nome, 44, y + 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 70, 86);
  const emitMeta: string[] = [];
  if (opts.profissional.crm) emitMeta.push(`${opts.profissional.conselho_tipo || "CRM"} ${opts.profissional.crm}${opts.profissional.uf ? "/" + opts.profissional.uf : ""}`);
  if (opts.profissional.cbo) emitMeta.push(`CBO ${opts.profissional.cbo}`);
  doc.text(emitMeta.join("   ·   "), 44, y + 40);
  const unidLinha: string[] = [];
  if (opts.unidade?.nome) unidLinha.push(opts.unidade.nome);
  if (opts.unidade?.endereco) unidLinha.push(opts.unidade.endereco);
  if (opts.unidade?.telefone) unidLinha.push(`Tel: ${opts.unidade.telefone}`);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(doc.splitTextToSize(unidLinha.join("   ·   "), pageW - 96), 44, y + 52);
  y += 74;

  // ===== Paciente =====
  drawSectionBox("PACIENTE", 44);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(opts.paciente.nome, 44, y + 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const pacLinha: string[] = [];
  if (opts.paciente.cpf) pacLinha.push(`CPF ${opts.paciente.cpf}`);
  if (opts.paciente.cns) pacLinha.push(`CNS ${opts.paciente.cns}`);
  if (opts.paciente.endereco) pacLinha.push(opts.paciente.endereco);
  doc.text(pacLinha.join("   ·   ") || "—", 44, y + 40);
  y += 56;

  // ===== Prescrição =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...corBorda);
  doc.text("PRESCRIÇÃO", 36, y);
  doc.setDrawColor(...corBordaMid);
  doc.setLineWidth(0.3);
  doc.line(96, y - 2, pageW - 36, y - 2);
  y += 12;
  doc.setTextColor(15, 23, 42);
  opts.medicamentos.forEach((m, i) => {
    if (y > pageH - 280) { doc.addPage(); y = 70; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    const titulo = `${i + 1}. ${m.nome}${m.apresentacao ? ` — ${m.apresentacao}` : ""}`;
    const tLines = doc.splitTextToSize(titulo, pageW - 90);
    doc.text(tLines, 36, y);
    y += tLines.length * 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(60, 70, 86);
    doc.text(`Posologia: ${m.posologia || "conforme orientação"}`, 52, y);
    y += 12;
    if (m.qtd) {
      const ext = numeroPorExtenso(m.qtd);
      doc.text(`Quantidade: ${m.qtd}${ext ? ` (${ext})` : ""}`, 52, y);
      y += 12;
    }
    if (m.duracao) { doc.text(`Duração: ${m.duracao}`, 52, y); y += 12; }
    doc.setTextColor(15, 23, 42);
    y += 6;
  });

  if (opts.orientacoes?.trim()) {
    if (y > pageH - 240) { doc.addPage(); y = 70; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...corBorda);
    doc.text("ORIENTAÇÕES", 36, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const oLines = doc.splitTextToSize(opts.orientacoes, pageW - 72);
    doc.text(oLines, 36, y);
    y += oLines.length * 11 + 8;
  }

  // ===== Comprador =====
  if (y > pageH - 220) { doc.addPage(); y = 70; }
  drawSectionBox("IDENTIFICAÇÃO DO COMPRADOR", 50);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Nome: ${opts.comprador?.nome ?? "_________________________________________________"}`, 44, y + 28);
  doc.text(`RG: ${opts.comprador?.rg ?? "______________________"}    Endereço: ${opts.comprador?.endereco ?? "____________________________"}`, 44, y + 42);
  y += 60;

  // ===== Fornecedor (farmácia) =====
  drawSectionBox("IDENTIFICAÇÃO DO FORNECEDOR (FARMÁCIA)", 36);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Nome do farmacêutico: ____________________   CRF: __________   Data: __/__/____", 44, y + 26);
  y += 48;

  // ===== Assinatura =====
  const sigY = y + 26;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(pageW / 2 - 140, sigY, pageW / 2 + 140, sigY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(opts.profissional.nome, pageW / 2, sigY + 12, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (opts.profissional.crm) {
    doc.text(
      `${opts.profissional.conselho_tipo || "CRM"} ${opts.profissional.crm}${opts.profissional.uf ? "/" + opts.profissional.uf : ""}`,
      pageW / 2, sigY + 24, { align: "center" },
    );
  }
  if (opts.notificacao?.assinatura_curta || opts.notificacao?.assinatura) {
    const curta = opts.notificacao?.assinatura_curta
      ?? `${opts.notificacao.assinatura!.slice(0, 8)}…${opts.notificacao.assinatura!.slice(-4)}`;
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Assinatura digital HMAC-SHA256:  ${curta}`, pageW / 2, sigY + 36, { align: "center" });
  }

  const validade = opts.notificacao?.validade_dias ?? 30;
  const uf = opts.notificacao?.uf_emissao || opts.profissional.uf || "—";
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Validade: ${validade} dias a contar da emissão · Válida somente no estado de ${uf}`,
    pageW / 2, sigY + 50, { align: "center" },
  );
  doc.setFontSize(6.8);
  doc.text(
    "Documento eletrônico validável digitalmente — Lei 14.063/2020 e MP 2.200-2/2001",
    pageW / 2, sigY + 60, { align: "center" },
  );

  // ===== Marca d'água de status =====
  const status = opts.notificacao?.status ?? "valida";
  if (status !== "valida") {
    doc.saveGraphicsState();
    // @ts-expect-error jsPDF GState
    doc.setGState(new (doc as any).GState({ opacity: 0.16 }));
    const wmCor: [number, number, number] = status === "cancelada" ? [185, 28, 28] : [120, 113, 108];
    doc.setTextColor(...wmCor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(96);
    doc.text(status.toUpperCase(), pageW / 2, pageH / 2, { align: "center", angle: 28 });
    doc.restoreGraphicsState();
  }
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
  const conteudoHash = await hashConteudoClient(protocolo + '|' + opts.paciente.nome);
  const sig = await tentarAssinar({ protocolo, tipo: 'receita', conteudo_hash: conteudoHash });
  const qr = await buildQrDataUrl(buildVerifyUrl(protocolo));
  drawVerificationOnAllPages(doc, { protocolo, qrDataUrl: qr , assinatura: sig?.assinatura, assinadoEm: sig?.assinado_em });
  drawFooterAllPages(doc, { logo, emitidoPor: opts.usuarioNome });
  await registrarDocumento({
    protocolo, tipo: "receita",
    paciente: { nome: opts.paciente.nome, cpf: opts.paciente.cpf },
    profissional: opts.profissional,
    unidade: { nome: opts.unidade?.nome, cnes: opts.unidade?.cnes },
    metadata: {
      tipo_receita: opts.tipo,
      qtd_medicamentos: opts.medicamentos.length,
      conteudo_hash: conteudoHash,
      ...(opts.notificacao ? { notificacao_numero: opts.notificacao.numero, uf_emissao: opts.notificacao.uf_emissao } : {}),
    },
    assinatura: sig?.assinatura ?? null,
    assinatura_payload_sha: sig?.assinatura_payload_sha ?? null,
    assinado_em: sig?.assinado_em ?? null,
  });
  openPdf(doc, `receita-${opts.paciente.nome.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
