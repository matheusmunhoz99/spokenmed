// Builder FVD — Ficha de Visita Domiciliar.
import { digits, epochMs, tag, tagList } from "./escape";
import { montarEnvelope, renderHeaderUnicaLotacao, type HeaderTransport } from "./envelope";

const TURNO_MAP: Record<string, number> = { manha: 1, manhã: 1, tarde: 2, noite: 3 };
const SEXO_MAP: Record<string, number> = { F: 0, M: 1 };
const DESFECHO_MAP: Record<string, number> = { realizada: 1, recusada: 2, ausente: 3 };

export interface FvdInput {
  header: HeaderTransport;
  cnes: string;
  ine?: string | null;
  codIbge: string;
  numLote: number;
  loteUuid: string;
  visita: any;
  paciente: any;
}

export function buildFvdXml(input: FvdInput): { uuidDadoSerializado: string; xml: string } {
  const v = input.visita;
  const p = input.paciente ?? {};
  const uuidFicha = `${input.cnes}-${Math.floor(Math.random()*1e10).toString().padStart(10,"0")}-FDVD-0000-0000-${String(input.numLote).padStart(10,"0")}`;
  const dtNasc = epochMs(p.data_nascimento);
  const sexo = SEXO_MAP[p.sexo] ?? null;
  const turno = TURNO_MAP[String(v.turno ?? "").toLowerCase()] ?? null;
  const desfecho = DESFECHO_MAP[String(v.desfecho ?? "").toLowerCase()] ?? null;
  const motivos: number[] = ((v.motivos as unknown[]) ?? [])
    .map((m: any) => Number(m))
    .filter((n) => Number.isFinite(n));

  const bloco =
    `<visitasDomiciliares>` +
    (turno != null ? tag("turno", turno) : "") +
    (digits(p.cpf) ? tag("cpfCidadao", digits(p.cpf)!) : "") +
    (!digits(p.cpf) && digits(p.cns) ? tag("cnsCidadao", digits(p.cns)!) : "") +
    (dtNasc != null ? tag("dtNascimento", dtNasc) : "") +
    (sexo != null ? tag("sexo", sexo) : "") +
    tag("statusVisitaCompartilhadaOutroProfissional", "false") +
    tagList("motivosVisita", motivos) +
    (desfecho != null ? tag("desfecho", desfecho) : "") +
    (v.microarea ? tag("microArea", v.microarea) : "") +
    tag("stForaArea", v.fora_area ? "true" : "false") +
    `</visitasDomiciliares>`;

  const conteudo =
    tag("uuidFicha", uuidFicha) +
    tag("tpCdsOrigem", 3) +
    renderHeaderUnicaLotacao(input.header) +
    bloco;

  return {
    uuidDadoSerializado: uuidFicha,
    xml: montarEnvelope({
      tipo: "FVD",
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
