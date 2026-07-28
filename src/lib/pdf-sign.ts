import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { buildVerifyUrl, VERIFY_DISPLAY } from "./verificacao-url";
import { assinarPdfRegistro, finalizarAssinaturaPdf } from "./assinatura-pdf.functions";

export type AssinaturaInfo = {
  protocolo: string;
  assinatura: string;
  assinado_em: string;
  assinante_nome: string;
  assinante_email: string | null;
  assinante_cargo: string | null;
  assinante_conselho: string | null;
  ip_mask: string | null;
};

export async function sha256Bytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
  const digest = await crypto.subtle.digest("SHA-256", buf as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function grupos(hash: string, tamanho = 8) {
  return (hash.match(new RegExp(`.{1,${tamanho}}`, "g")) ?? []).join(" ");
}

/** Carimba o PDF: faixa em todas as páginas + página de manifesto com QR. */
export async function carimbarPdf(
  original: ArrayBuffer,
  info: AssinaturaInfo,
  extras?: { nomeArquivo?: string; motivo?: string | null; hashOriginal?: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const verifyUrl = buildVerifyUrl(info.protocolo);
  const teal = rgb(0.058, 0.463, 0.431);
  const tealSoft = rgb(0.898, 0.968, 0.953);
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.42, 0.45, 0.5);

  const linha = `Assinado eletronicamente por ${info.assinante_nome}${info.assinante_conselho ? " · " + info.assinante_conselho : ""} em ${fmtDataHora(info.assinado_em)}`;
  const linha2 = `Protocolo ${info.protocolo} · Verifique em ${VERIFY_DISPLAY}`;

  // Faixa lateral em todas as páginas
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: 0, width: 20, height, color: tealSoft });
    page.drawRectangle({ x: 19.4, y: 0, width: 0.8, height, color: teal });
    page.drawText(`${linha}  |  ${linha2}`, {
      x: 12,
      y: 14,
      size: 6.6,
      font: helv,
      color: teal,
      rotate: degrees(90),
      maxWidth: height - 24,
    });
  }

  // ===== Página de manifesto =====
  const page = pdf.addPage([595.28, 841.89]);
  const W = 595.28;
  const H = 841.89;

  page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: teal });
  page.drawText("MANIFESTO DE ASSINATURA ELETRÔNICA", {
    x: 40, y: H - 52, size: 16, font: helvBold, color: rgb(1, 1, 1),
  });
  page.drawText("SpokenMED · Assinatura Eletrônica Avançada (Lei 14.063/2020, art. 4º, II)", {
    x: 40, y: H - 72, size: 8.5, font: helv, color: rgb(0.85, 0.98, 0.95),
  });

  let y = H - 130;
  const campo = (label: string, valor: string) => {
    page.drawText(label.toUpperCase(), { x: 40, y, size: 7, font: helvBold, color: muted });
    const linhas = quebrar(valor, 78);
    linhas.forEach((l, i) => {
      page.drawText(l, { x: 40, y: y - 13 - i * 11, size: 9.5, font: helv, color: ink });
    });
    y -= 26 + (linhas.length - 1) * 11;
  };

  campo("Documento", extras?.nomeArquivo ?? "documento.pdf");
  if (extras?.motivo) campo("Finalidade / motivo", extras.motivo);
  campo("Assinado por", info.assinante_nome);
  if (info.assinante_conselho) campo("Registro profissional", info.assinante_conselho);
  if (info.assinante_cargo) campo("Cargo / função", info.assinante_cargo);
  if (info.assinante_email) campo("Usuário (e-mail)", info.assinante_email);
  campo("Data e hora da assinatura", `${fmtDataHora(info.assinado_em)} (horário de Brasília)`);
  if (info.ip_mask) campo("Endereço IP de origem", info.ip_mask);
  campo("Protocolo de verificação", info.protocolo);
  if (extras?.hashOriginal) campo("Hash SHA-256 do documento original", grupos(extras.hashOriginal));
  campo("Código da assinatura (HMAC-SHA256)", grupos(info.assinatura.slice(0, 48)));

  // QR
  try {
    const qrData = await QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: "M", margin: 0, width: 320 });
    const qrImg = await pdf.embedPng(qrData);
    const size = 120;
    page.drawRectangle({ x: W - 40 - size - 16, y: 90, width: size + 32, height: size + 58, color: tealSoft, borderColor: teal, borderWidth: 0.8 });
    page.drawImage(qrImg, { x: W - 40 - size, y: 122, width: size, height: size });
    page.drawText("Aponte a câmera para", { x: W - 40 - size - 4, y: 108, size: 7, font: helvBold, color: teal });
    page.drawText("validar este documento", { x: W - 40 - size - 4, y: 99, size: 7, font: helvBold, color: teal });
  } catch { /* QR opcional */ }

  page.drawText("Como validar:", { x: 40, y: 200, size: 9, font: helvBold, color: ink });
  quebrar(
    `Acesse ${VERIFY_DISPLAY} e informe o protocolo ${info.protocolo}. O portal confirma o autor, a data/hora e a integridade do arquivo. Qualquer alteração no conteúdo invalida a conferência do hash.`,
    72,
  ).forEach((l, i) => page.drawText(l, { x: 40, y: 185 - i * 12, size: 8.5, font: helv, color: muted }));

  return pdf.save();
}

function quebrar(texto: string, max: number): string[] {
  const palavras = texto.split(/\s+/);
  const out: string[] = [];
  let atual = "";
  for (const p of palavras) {
    if ((atual + " " + p).trim().length > max) { out.push(atual.trim()); atual = p; }
    else atual += " " + p;
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
}

export type AssinarPdfArgs = {
  bytes: ArrayBuffer;
  nomeArquivo: string;
  motivo?: string | null;
  agendamentoId?: string | null;
  pacienteId?: string | null;
  unidadeId?: string | null;
};

/** Fluxo completo: hash → registro assinado no servidor → carimbo → upload → link. */
export async function assinarPdf(args: AssinarPdfArgs): Promise<{ protocolo: string; bytes: Uint8Array; info: AssinaturaInfo }> {
  const hashOriginal = await sha256Bytes(args.bytes);

  const info = (await assinarPdfRegistro({
    data: {
      nome_arquivo: args.nomeArquivo,
      hash_original: hashOriginal,
      tamanho_bytes: args.bytes.byteLength,
      motivo: args.motivo ?? null,
      agendamento_id: args.agendamentoId ?? null,
      paciente_id: args.pacienteId ?? null,
      unidade_id: args.unidadeId ?? null,
    },
  })) as AssinaturaInfo;

  const assinado = await carimbarPdf(args.bytes, info, {
    nomeArquivo: args.nomeArquivo,
    motivo: args.motivo,
    hashOriginal,
  });
  const hashAssinado = await sha256Bytes(assinado);

  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (uid) {
      const base = `${uid}/${info.protocolo}`;
      const blobAssinado = new Blob([assinado.slice().buffer as ArrayBuffer], { type: "application/pdf" });
      const blobOriginal = new Blob([args.bytes], { type: "application/pdf" });
      const up1 = await supabase.storage.from("assinaturas-pdf").upload(`${base}-assinado.pdf`, blobAssinado, { contentType: "application/pdf", upsert: true });
      await supabase.storage.from("assinaturas-pdf").upload(`${base}-original.pdf`, blobOriginal, { contentType: "application/pdf", upsert: true });
      if (!up1.error) {
        await finalizarAssinaturaPdf({
          data: {
            protocolo: info.protocolo,
            storage_path: `${base}-assinado.pdf`,
            storage_path_original: `${base}-original.pdf`,
            hash_assinado: hashAssinado,
          },
        });
      }
    }
  } catch (e) {
    console.warn("Falha ao arquivar PDF assinado:", e);
  }

  return { protocolo: info.protocolo, bytes: assinado, info };
}

export function baixarPdf(bytes: Uint8Array, nome: string) {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
