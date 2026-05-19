/**
 * Builder Thrift binário — Ficha de Atendimento Odontológico (FAO), LEDI 7.4.
 *
 * Estrutura Master/Child:
 *   FichaAtendimentoOdontologicoMaster {
 *     1: required string uuidFicha,
 *     2: required UnicaLotacaoHeader headerTransport,
 *     3: required i32 tpCdsOrigem,
 *     4: required list<AtendimentoOdontologicoChild> atendimentosOdontologicos,
 *   }
 *
 * Spec: https://integracao.esusaps.bridge.ufsc.tech/ledi/documentacao/atendimento_odontologico/
 */
import { TBinaryWriter, buildStruct } from "../protocol";
import { writeUnicaLotacaoHeader, type UnicaLotacaoHeaderInput } from "../header";

function digits(v: string | null | undefined): string | null {
  if (!v) return null;
  const c = v.replace(/\D/g, "");
  return c.length ? c : null;
}
function epoch(d: string | Date | null | undefined): number {
  if (!d) return 0;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isFinite(x.getTime()) ? x.getTime() : 0;
}

interface ChildOdontoInput {
  uuidFichaOrigem: string;
  cnsCidadao?: string | null;
  cpfCidadao?: string | null;
  dtNascimento?: number | null;
  sexoCidadao?: 0 | 1 | null;
  numProntuario?: string | null;
  localAtendimento?: number;
  turno: number;
  tipoAtendimento: number;            // 1 cons agendada 2 cons dia 3 atend urgência
  vigilanciaEmSaudeBucal?: number[];  // códigos LEDI
  tipoConsulta?: number;              // 1 primeira programática 2 manutenção 3 não programada
  fornecimentos?: number[];           // escova, creme dental etc
  procedimentos?: string[];           // SIGTAP
  cids10?: string[];
  condutaList: number[];
  encaminhamentoExternoList?: number[];
  encaminhamentoInternoList?: number[];
  gestante?: boolean;
}

function writeChild(w: TBinaryWriter, c: ChildOdontoInput) {
  w.reqString(1, c.uuidFichaOrigem);
  w.optString(2, c.cnsCidadao);
  w.optString(3, c.cpfCidadao);
  w.optI64(4, c.dtNascimento ?? null);
  if (c.sexoCidadao != null) { w.writeFieldBegin(8, 5); w.writeI32(c.sexoCidadao); }
  w.optString(6, c.numProntuario);
  if (c.localAtendimento != null) { w.writeFieldBegin(8, 7); w.writeI32(c.localAtendimento); }
  w.writeFieldBegin(8, 8); w.writeI32(c.turno);
  w.writeFieldBegin(8, 9); w.writeI32(c.tipoAtendimento);
  w.optListI64(10, c.vigilanciaEmSaudeBucal);
  if (c.tipoConsulta != null) { w.writeFieldBegin(8, 11); w.writeI32(c.tipoConsulta); }
  w.optListI64(12, c.fornecimentos);
  w.optListString(13, c.procedimentos);
  w.optListString(14, c.cids10);
  if (c.condutaList.length) w.optListI64(15, c.condutaList);
  w.optListI64(16, c.encaminhamentoExternoList);
  w.optListI64(17, c.encaminhamentoInternoList);
  w.optBool(18, c.gestante);
}

export interface FaoInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  atendimentos: any[]; // rows agendamentos+pacientes filtrados por CBO odonto
}

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function buildFAOThrift(input: FaoInput): Uint8Array {
  const children: ChildOdontoInput[] = input.atendimentos.map((a) => {
    const pac = a.pacientes ?? {};
    const horaInicio = a.hora_inicio ?? "12:00:00";
    const h = parseInt(String(horaInicio).slice(0, 2), 10);
    const turno = h < 12 ? 1 : h < 18 ? 2 : 3;
    const cid = a.cid10 ? [String(a.cid10).toUpperCase()] : [];
    const proc = a.procedimentos?.codigo_sigtap ? [a.procedimentos.codigo_sigtap] : [];

    return {
      uuidFichaOrigem: uuidv4(),
      cnsCidadao: digits(pac.cns),
      cpfCidadao: digits(pac.cpf),
      dtNascimento: epoch(pac.data_nascimento) || null,
      sexoCidadao: pac.sexo === "F" ? 0 : pac.sexo === "M" ? 1 : null,
      numProntuario: pac.numero_prontuario || null,
      localAtendimento: 1,
      turno,
      tipoAtendimento: 1,
      tipoConsulta: 3, // não programada (default seguro)
      procedimentos: proc,
      cids10: cid,
      condutaList: [1],
    };
  });

  return buildStruct((w) => {
    w.reqString(1, input.uuidFicha);
    w.reqStruct(2, (sw) => writeUnicaLotacaoHeader(sw, input.header));
    w.writeFieldBegin(8, 3); w.writeI32(3);
    w.optListStruct(4, children, (sw, c) => writeChild(sw, c));
  });
}
