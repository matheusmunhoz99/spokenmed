// Builder FAI — Ficha de Atendimento Individual.
import { digits, epochMs, escapeXml, tag, tagList } from "./escape";
import {
  gerarUuidDadoSerializado, montarEnvelope, renderHeaderVariasLotacoes,
  type HeaderTransport,
} from "./envelope";

const TURNO_MAP: Record<string, number> = { manha: 1, manhã: 1, tarde: 2, noite: 3 };
const SEXO_MAP: Record<string, number> = { F: 0, M: 1 };

export interface FaiInput {
  header: HeaderTransport;
  cnes: string;
  ine?: string | null;
  codIbge: string;
  numLote: number;
  loteUuid: string;
  /** Lista de atendimentos finalizados (cada um vira UM XML/ficha). */
  atendimento: any;
  paciente: any;
}

function renderProblemasCondicoes(a: any): string {
  const out: string[] = [];
  for (const c of (a.cids as string[] | null | undefined) ?? []) {
    if (!c) continue;
    out.push(`<problemasCondicoes>${tag("cid10", c)}${tag("isAvaliado", "true")}</problemasCondicoes>`);
  }
  for (const c of (a.ciaps as string[] | null | undefined) ?? []) {
    if (!c) continue;
    out.push(`<problemasCondicoes>${tag("ciap", c)}${tag("isAvaliado", "true")}</problemasCondicoes>`);
  }
  return out.join("");
}

function renderExames(a: any): string {
  const av: string[] = (a.exames_avaliados as string[] | null | undefined) ?? [];
  const sol: string[] = (a.exames_solicitados as string[] | null | undefined) ?? [];
  let out = "";
  for (const c of av) if (c) out += `<exame>${tag("codigoExame", c)}${tag("solicitadoAvaliado", "A")}</exame>`;
  for (const c of sol) if (c) out += `<exame>${tag("codigoExame", c)}${tag("solicitadoAvaliado", "S")}</exame>`;
  return out;
}

function renderMedicoes(a: any): string {
  const partes =
    tag("peso", a.peso) +
    tag("altura", a.altura) +
    tag("perimetroCefalico", a.perimetro_cefalico) +
    tag("imc", a.imc) +
    tag("pressaoArterial", a.pa) +
    tag("frequenciaCardiaca", a.fc) +
    tag("frequenciaRespiratoria", a.fr) +
    tag("temperatura", a.temperatura) +
    tag("saturacao", a.saturacao);
  if (!partes) return "";
  return `<medicoes>${partes}</medicoes>`;
}

export function buildFaiXml(input: FaiInput): { uuidDadoSerializado: string; xml: string } {
  const a = input.atendimento;
  const p = input.paciente ?? {};
  const uuidFicha = `${input.cnes}-${Math.floor(Math.random()*1e10).toString().padStart(10,"0")}-FDAI-0000-0000-${String(input.numLote).padStart(10,"0")}`;
  const uuidDado = uuidFicha;
  const dtNasc = epochMs(p.data_nascimento);
  const sexo = SEXO_MAP[p.sexo] ?? null;
  const turno = TURNO_MAP[String(a.turno ?? "").toLowerCase()] ?? null;
  const iniciado = epochMs(a.created_at) ?? input.header.dataAtendimentoEpochMs;
  const finalizado = epochMs(a.finalizado_em) ?? iniciado;

  const atendimentosBloco =
    `<atendimentosIndividuais>` +
    tag("numeroProntuario", a.id?.toString().slice(0, 12) ?? "") +
    (digits(p.cpf) ? tag("cpfCidadao", digits(p.cpf)!) : "") +
    (!digits(p.cpf) && digits(p.cns) ? tag("cnsCidadao", digits(p.cns)!) : "") +
    (dtNasc != null ? tag("dataNascimento", dtNasc) : "") +
    tag("localDeAtendimento", 1) +
    (sexo != null ? tag("sexo", sexo) : "") +
    (turno != null ? tag("turno", turno) : "") +
    tag("tipoAtendimento", 1) +
    renderMedicoes(a) +
    renderExames(a) +
    tag("condutas", 1) +
    tag("dataHoraInicialAtendimento", iniciado) +
    tag("dataHoraFinalAtendimento", finalizado) +
    renderProblemasCondicoes(a) +
    `</atendimentosIndividuais>`;

  const conteudo =
    renderHeaderVariasLotacoes(input.header) +
    atendimentosBloco +
    tag("tpCdsOrigem", 3) +
    tag("uuidFicha", uuidFicha);

  const xml = montarEnvelope({
    tipo: "FAI",
    uuidDadoSerializado: uuidDado,
    codIbge: input.codIbge,
    cnes: input.cnes,
    ine: input.ine ?? null,
    numLote: input.numLote,
    loteUuid: input.loteUuid,
    conteudoMasterInterno: conteudo,
  });
  // referencia escapeXml para evitar tree-shake-warning
  void escapeXml; void tagList; void gerarUuidDadoSerializado;
  return { uuidDadoSerializado: uuidDado, xml };
}
