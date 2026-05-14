import jsPDF from "jspdf";
import { formatCPF, formatPhone, formatTime } from "./format";

export type ComprovanteData = {
  codigo: string;
  data: string; // yyyy-MM-dd
  hora: string; // HH:MM:SS
  paciente: { nome: string; cpf?: string | null; telefone?: string | null; cns?: string | null };
  profissional: { nome: string; especialidade?: string | null };
  unidade: { nome: string; endereco?: string | null; telefone?: string | null };
  motivo?: string | null;
  emitidoPor?: string;
};

const dataExtenso = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

export function gerarComprovante(c: ComprovanteData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 50;

  // Cabeçalho
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 80, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255);
  doc.text("COMPROVANTE DE AGENDAMENTO", pageW / 2, 38, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("SpokenMED · Sistema de Agendamento Médico", pageW / 2, 58, { align: "center" });

  doc.setTextColor(0);

  // Caixa código
  let y = 110;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Código do agendamento", marginX, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(c.codigo.toUpperCase(), marginX, y + 16);

  // Bloco data/horário destacado
  y += 50;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1);
  doc.roundedRect(marginX, y, pageW - marginX * 2, 70, 6, 6, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(37, 99, 235);
  doc.text("DATA E HORÁRIO DA CONSULTA", marginX + 16, y + 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text(`${dataExtenso(c.data)} · ${formatTime(c.hora)}`, marginX + 16, y + 50);

  // Seções
  y += 100;
  drawSection(doc, "PACIENTE", marginX, y, pageW - marginX * 2);
  y += 22;
  drawRow(doc, "Nome", c.paciente.nome, marginX, y); y += 18;
  if (c.paciente.cpf) { drawRow(doc, "CPF", formatCPF(c.paciente.cpf), marginX, y); y += 18; }
  if (c.paciente.cns) { drawRow(doc, "Cartão SUS", c.paciente.cns, marginX, y); y += 18; }
  if (c.paciente.telefone) { drawRow(doc, "Telefone", formatPhone(c.paciente.telefone), marginX, y); y += 18; }

  y += 12;
  drawSection(doc, "PROFISSIONAL", marginX, y, pageW - marginX * 2);
  y += 22;
  drawRow(doc, "Nome", c.profissional.nome, marginX, y); y += 18;
  if (c.profissional.especialidade) { drawRow(doc, "Especialidade", c.profissional.especialidade, marginX, y); y += 18; }

  y += 12;
  drawSection(doc, "UNIDADE DE ATENDIMENTO", marginX, y, pageW - marginX * 2);
  y += 22;
  drawRow(doc, "Local", c.unidade.nome, marginX, y); y += 18;
  if (c.unidade.endereco) { drawRow(doc, "Endereço", c.unidade.endereco, marginX, y); y += 18; }
  if (c.unidade.telefone) { drawRow(doc, "Telefone", formatPhone(c.unidade.telefone), marginX, y); y += 18; }

  if (c.motivo) {
    y += 12;
    drawSection(doc, "MOTIVO / OBSERVAÇÕES", marginX, y, pageW - marginX * 2);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    const lines = doc.splitTextToSize(c.motivo, pageW - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 14;
  }

  // Lembrete
  y += 24;
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(252, 211, 77);
  doc.roundedRect(marginX, y, pageW - marginX * 2, 56, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(146, 64, 14);
  doc.text("LEMBRETES IMPORTANTES", marginX + 12, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 53, 15);
  doc.text("• Chegue com 15 minutos de antecedência. Traga documento com foto e Cartão SUS.", marginX + 12, y + 34);
  doc.text("• Em caso de impossibilidade, entre em contato para reagendar com pelo menos 24h.", marginX + 12, y + 48);

  // Rodapé
  doc.setTextColor(120);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const agora = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const rodape = c.emitidoPor
    ? `Comprovante emitido por ${c.emitidoPor} em ${agora}`
    : `Comprovante emitido em ${agora}`;
  doc.text(rodape, pageW / 2, pageH - 28, { align: "center" });

  doc.save(`comprovante_${c.codigo.slice(0, 8)}.pdf`);
}

function drawSection(doc: jsPDF, title: string, x: number, y: number, w: number) {
  doc.setFillColor(241, 245, 249);
  doc.rect(x, y, w, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(title, x + 10, y + 15);
  doc.setTextColor(0);
}

function drawRow(doc: jsPDF, label: string, value: string, x: number, y: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(label, x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(value, x + 100, y);
}
