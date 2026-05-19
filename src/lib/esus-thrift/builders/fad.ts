/**
 * Builder Thrift binário — Ficha de Atendimento Domiciliar (FAD), LEDI 7.4.
 *
 * Estrutura simplificada (Master/Child):
 *   FichaAtendimentoDomiciliarMaster {
 *     1: required string uuidFicha,
 *     2: required UnicaLotacaoHeader headerTransport,
 *     3: required i32 tpCdsOrigem,
 *     4: required list<FichaAtendimentoDomiciliarChild> atendimentosDomiciliares,
 *   }
 *
 * Spec: https://integracao.esusaps.bridge.ufsc.tech/ledi/documentacao/atendimento_domiciliar/
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

interface ChildInput {
  uuidFichaOrigem: string;
  cnsCidadao?: string | null;
  cpfCidadao?: string | null;
  dtNascimento?: number | null;
  sexoCidadao?: 0 | 1 | null;
  numProntuario?: string | null;
  turno: number; // 1 manha 2 tarde 3 noite
  localAtendimento?: number;
  modalidadeAtencaoDomiciliar?: number;
  cidPrincipal?: string | null;
  condicoesAvaliadas?: number[];
  condutaDesfecho: number; // 1 realizada / 2 recusada / 3 ausente etc
  procedimentos?: string[]; // SIGTAP
}

function writeChild(w: TBinaryWriter, c: ChildInput) {
  w.reqString(1, c.uuidFichaOrigem);
  w.optString(2, c.cnsCidadao);
  w.optString(3, c.cpfCidadao);
  w.optI64(4, c.dtNascimento ?? null);
  if (c.sexoCidadao != null) { w.writeFieldBegin(8, 5); w.writeI32(c.sexoCidadao); }
  w.optString(6, c.numProntuario);
  w.writeFieldBegin(8, 7); w.writeI32(c.turno);
  if (c.localAtendimento != null) { w.writeFieldBegin(8, 8); w.writeI32(c.localAtendimento); }
  if (c.modalidadeAtencaoDomiciliar != null) { w.writeFieldBegin(8, 9); w.writeI32(c.modalidadeAtencaoDomiciliar); }
  w.optString(10, c.cidPrincipal);
  w.optListI64(11, c.condicoesAvaliadas);
  w.writeFieldBegin(8, 12); w.writeI32(c.condutaDesfecho);
  w.optListString(13, c.procedimentos);
}

export interface FadInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  visitas: any[]; // rows visitas_domiciliares + pacientes
}

export function buildFADThrift(input: FadInput): Uint8Array {
  const turnoMap: Record<string, number> = { manha: 1, tarde: 2, noite: 3 };
  const desfMap: Record<string, number> = { realizada: 1, recusada: 2, ausente: 3 };

  const children: ChildInput[] = input.visitas.map((v) => {
    const pac = (v as any).pacientes ?? {};
    return {
      uuidFichaOrigem: v.uuid_ficha ?? input.uuidFicha,
      cnsCidadao: digits(pac.cns ?? v.cns),
      cpfCidadao: digits(pac.cpf ?? v.cpf),
      dtNascimento: epoch(pac.data_nascimento ?? v.data_nascimento_cidadao) || null,
      sexoCidadao: (pac.sexo ?? v.sexo_cidadao) === "F" ? 0 : (pac.sexo ?? v.sexo_cidadao) === "M" ? 1 : null,
      numProntuario: v.numero_prontuario || null,
      turno: turnoMap[v.turno] ?? 3,
      condicoesAvaliadas: Array.isArray(v.condicoes_avaliadas) ? v.condicoes_avaliadas : [],
      condutaDesfecho: desfMap[v.desfecho] ?? 3,
      procedimentos: Array.isArray(v.procedimentos) ? v.procedimentos : undefined,
    };
  });

  return buildStruct((w) => {
    w.reqString(1, input.uuidFicha);
    w.reqStruct(2, (sw) => writeUnicaLotacaoHeader(sw, input.header));
    w.writeFieldBegin(8, 3); w.writeI32(3);
    w.optListStruct(4, children, (sw, c) => writeChild(sw, c));
  });
}
