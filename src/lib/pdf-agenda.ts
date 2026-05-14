import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCPF, formatPhone, formatTime } from "./format";

const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  atendido: "Atendido",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

export type AgendaItem = {
  hora_inicio: string;
  status: string;
  motivo?: string | null;
  pacientes?: { nome?: string; cpf?: string | null; telefone?: string | null } | null;
  profissionais?: { nome?: string; especialidades?: { nome?: string } | null } | null;
  unidades?: { nome?: string } | null;
};

export type GerarPdfAgendaOpts = {
  data: string; // yyyy-MM-dd
  unidadeNome: string; // ou "Todas as unidades"
  agendamentos: AgendaItem[];
  usuarioNome: string;
};

const dataExtenso = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

export function gerarPdfAgenda({ data, unidadeNome, agendamentos, usuarioNome }: GerarPdfAgendaOpts) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 36;

  // ===== Cabeçalho =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("AGENDA DO DIA", marginX, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Unidade: ${unidadeNome}`, marginX, 70);
  doc.text(`Data: ${dataExtenso(data)}`, marginX, 86);
  doc.text(`Total de consultas: ${agendamentos.length}`, marginX, 102);

  doc.setDrawColor(180);
  doc.setLineWidth(0.5);
  doc.line(marginX, 112, pageW - marginX, 112);

  // ===== Agrupamento por profissional =====
  const grupos = new Map<string, { nome: string; especialidade: string; itens: AgendaItem[] }>();
  for (const a of agendamentos) {
    const profNome = a.profissionais?.nome ?? "(Sem profissional)";
    const espec = a.profissionais?.especialidades?.nome ?? "";
    const key = profNome + "|" + espec;
    if (!grupos.has(key)) grupos.set(key, { nome: profNome, especialidade: espec, itens: [] });
    grupos.get(key)!.itens.push(a);
  }
  const gruposOrdenados = Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome));

  let cursorY = 130;

  if (gruposOrdenados.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(120);
    doc.text("Nenhum agendamento para os filtros selecionados.", marginX, cursorY);
    doc.setTextColor(0);
  }

  for (const g of gruposOrdenados) {
    // Quebra de página se faltar espaço para cabeçalho do grupo
    if (cursorY > pageH - 120) {
      doc.addPage();
      cursorY = 50;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text(g.nome, marginX, cursorY);
    if (g.especialidade) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text(`· ${g.especialidade}`, marginX + doc.getTextWidth(g.nome) + 6, cursorY);
    }
    doc.setTextColor(0);
    cursorY += 8;

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
      startY: cursorY + 4,
      head: [["Hora", "Paciente", "CPF", "Telefone", "Status", "Motivo / Observações"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4, valign: "middle" },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 50, halign: "center" },
        1: { cellWidth: 180 },
        2: { cellWidth: 90 },
        3: { cellWidth: 95 },
        4: { cellWidth: 75, halign: "center" },
        5: { cellWidth: "auto" },
      },
      margin: { left: marginX, right: marginX },
    });

    // @ts-expect-error autotable injeta lastAutoTable
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 18;
  }

  // ===== Rodapé em todas as páginas =====
  const totalPages = doc.getNumberOfPages();
  const agora = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageH - 32, pageW - marginX, pageH - 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Impresso por ${usuarioNome} em ${agora}`, marginX, pageH - 18);
    doc.text(`Página ${i} de ${totalPages}`, pageW - marginX, pageH - 18, { align: "right" });
    doc.text("SpokenMED · Sistema de Agendamento Médico", pageW / 2, pageH - 18, { align: "center" });
    doc.setTextColor(0);
  }

  // ===== Download =====
  const slug = unidadeNome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "todas";
  const filename = `agenda_${slug}_${data}.pdf`;
  doc.save(filename);
}
