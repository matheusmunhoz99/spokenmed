// Builder FAO — Ficha de Atendimento Odontológico (estrutura similar à FAI).
import { digits, epochMs, tag } from "./escape";
import {
  montarEnvelope, renderHeaderVariasLotacoes, type HeaderTransport,
} from "./envelope";

const TURNO_MAP: Record<string, number> = { manha: 1, manhã: 1, tarde: 2, noite: 3 };
const SEXO_MAP: Record<string, number> = { F: 0, M: 1 };

export interface FaoInput {
  header: HeaderTransport;
  cnes: string;
  ine?: string | null;
  codIbge: string;
  numLote: number;
  loteUuid: string;
  atendimento: any;
  paciente: any;
}

export function buildFaoXml(input: FaoInput): { uuidDadoSerializado: string; xml: string } {
  const a = input.atendimento;
  const p = input.paciente ?? {};
  const uuidFicha = `${input.cnes}-${Math.floor(Math.random()*1e10).toString().padStart(10,"0")}-FDAO-0000-0000-${String(input.numLote).padStart(10,"0")}`;
  const dtNasc = epochMs(p.data_nascimento);
  const sexo = SEXO_MAP[p.sexo] ?? null;
  const turno = TURNO_MAP[String(a.turno ?? "").toLowerCase()] ?? null;
  const iniciado = epochMs(a.created_at) ?? input.header.dataAtendimentoEpochMs;
  const finalizado = epochMs(a.finalizado_em) ?? iniciado;

  const bloco =
    `<atendimentosOdontologicos>` +
    (digits(p.cpf) ? tag("cpfCidadao", digits(p.cpf)!) : "") +
    (!digits(p.cpf) && digits(p.cns) ? tag("cnsCidadao", digits(p.cns)!) : "") +
    (dtNasc != null ? tag("dataNascimento", dtNasc) : "") +
    (sexo != null ? tag("sexo", sexo) : "") +
    (turno != null ? tag("turno", turno) : "") +
    tag("tipoAtendimento", 1) +
    tag("dataHoraInicialAtendimento", iniciado) +
    tag("dataHoraFinalAtendimento", finalizado) +
    `</atendimentosOdontologicos>`;

  const conteudo =
    renderHeaderVariasLotacoes(input.header) +
    bloco +
    tag("tpCdsOrigem", 3) +
    tag("uuidFicha", uuidFicha);

  return {
    uuidDadoSerializado: uuidFicha,
    xml: montarEnvelope({
      tipo: "FAO",
      uuidDadoSerializado: uuidFicha,
      codIbge: input.codIbge,
      cnes: input.cnes,
      ine: input.ine ?? null,
      numLote: input.numLote,
      loteUuid: input.loteUuid,
      conteudoMasterInterno: conteudo,
    }),
  };
}
