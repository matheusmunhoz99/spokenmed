import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCPF, formatPhone, formatTime } from "./format";
import { PDF_COLORS, drawHeader, drawFooterAllPages, loadLogo, openPdf, STATUS_LABEL } from "./pdf-shared";

export type AgendaItem = {
  hora_inicio: string;
  status: string;
  motivo?: string | null;
  pacientes?: { nome?: string; cpf?: string | null; telefone?: string | null } | null;
  profissionais?: { nome?: string; especialidades?: { nome?: string } | null } | null;
  unidades?: { nome?: string } | null;
};

export type GerarPdfAgendaOpts = {
  data: string;
  unidadeNome: string;
  agendamentos: AgendaItem[];
  usuarioNome: string;
};

const dataExtenso = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export async function gerarPdfAgenda({ data, unidadeNome, agendamentos, usuarioNome }: GerarPdfAgendaOpts) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 36;

  const logo = await loadLogo();
  let y = drawHeader(doc, {
    titulo: "Agenda do Dia",
    subtitulo: "SpokenMED · Sistema de Agendamento Médico",
    logo,
  });

  // ===== Resumo =====
  y += 18;
  doc.setFillColor(...PDF_COLORS.surface);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginX, y, pageW - marginX * 2, 56, 6, 6, "FD");

  drawSummaryItem(doc, "UNIDADE", unidadeNome, marginX + 16, y + 14);
  const dt = dataExtenso(data);
  drawSummaryItem(doc, "DATA", dt.charAt(0).toUpperCase() + dt.slice(1), marginX + 280, y + 14);
  drawSummaryItem(doc, "TOTAL DE CONSULTAS", String(agendamentos.length), pageW - marginX - 180, y + 14);

  y += 76;

  // ===== Agrupar por profissional =====
  const grupos = new Map<string, { nome: string; especialidade: string; itens: AgendaItem[] }>();
  for (const a of agendamentos) {
    const profNome = a.profissionais?.nome ?? "(Sem profissional)";
    const espec = a.profissionais?.especialidades?.nome ?? "";
    const key = profNome + "|" + espec;
    if (!grupos.has(key)) grupos.set(key, { nome: profNome, especialidade: espec, itens: [] });
    grupos.get(key)!.itens.push(a);
  }
  const gruposOrdenados = Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome));

  if (gruposOrdenados.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text("Nenhum agendamento para os filtros selecionados.", marginX, y);
    drawFooterAllPages(doc, { emitidoPor: usuarioNome, logo });
    saveDoc(doc, unidadeNome, data);
    return;
  }

  for (const g of gruposOrdenados) {
    if (y > pageH - 140) {
      doc.addPage();
      y = 60;
    }

    // faixa do profissional
    doc.setFillColor(...PDF_COLORS.primarySoft);
    doc.roundedRect(marginX, y, pageW - marginX * 2, 28, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...PDF_COLORS.primaryDark);
    doc.text(g.nome, marginX + 12, y + 18);

    if (g.especialidade) {
      // chip de especialidade à direita
      const chipText = g.especialidade;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const chipW = doc.getTextWidth(chipText) + 18;
      const chipX = pageW - marginX - 12 - chipW;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...PDF_COLORS.primary);
      doc.setLineWidth(0.5);
      doc.roundedRect(chipX, y + 6, chipW, 16, 8, 8, "FD");
      doc.setTextColor(...PDF_COLORS.primaryDark);
      doc.text(chipText, chipX + chipW / 2, y + 17, { align: "center" });
    }

    y += 32;

    const rows = g.itens
      .slice()
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
      .map((a) => [
        formatTime(a.hora_inicio),
        a.pacientes?.nome ?? "—",
        a.pacientes?.cpf ? formatCPF(a.pacientes.cpf) : "—",
        a.pacientes?.telefone ? formatPhone(a.pacientes.telefone) : "—",
        STATUS_LABEL[a.status] ?? a.status,
        a.motivo ?? "",
      ]);

    autoTable(doc, {
      startY: y,
      head: [["Hora", "Paciente", "CPF", "Telefone", "Status", "Motivo / Observações"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 6, valign: "middle", lineColor: PDF_COLORS.border, lineWidth: 0.4 },
      headStyles: {
        fillColor: PDF_COLORS.primary,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 9,
        cellPadding: 7,
      },
      alternateRowStyles: { fillColor: PDF_COLORS.surface },
      columnStyles: {
        0: { cellWidth: 50, halign: "center", fontStyle: "bold" },
        1: { cellWidth: 180 },
        2: { cellWidth: 90 },
        3: { cellWidth: 95 },
        4: { cellWidth: 80, halign: "center" },
        5: { cellWidth: "auto" },
      },
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.column.index === 4) {
          const status = (g.itens.slice().sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))[hookData.row.index] as AgendaItem).status;
          const cfg = PDF_COLORS.status[status];
          if (cfg) {
            hookData.cell.styles.fillColor = [cfg[0], cfg[1], cfg[2]];
            hookData.cell.styles.textColor = [cfg[3], cfg[4], cfg[5]];
            hookData.cell.styles.fontStyle = "bold";
          }
        }
      },
      margin: { left: marginX, right: marginX, bottom: 50 },
    });

    // @ts-expect-error autotable injeta lastAutoTable
    y = (doc.lastAutoTable?.finalY ?? y) + 18;
  }

  drawFooterAllPages(doc, { emitidoPor: usuarioNome, logo });
  saveDoc(doc, unidadeNome, data);
}

function drawSummaryItem(doc: jsPDF, label: string, value: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(label, x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(value, x, y + 18);
}

function saveDoc(doc: jsPDF, unidadeNome: string, data: string) {
  const slug =
    unidadeNome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "todas";
  doc.save(`agenda_${slug}_${data}.pdf`);
}
