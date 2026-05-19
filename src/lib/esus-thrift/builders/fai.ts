/**
 * Builder Thrift binário — Ficha de Atendimento Individual (FAI), LEDI 7.4.
 *
 * Estrutura Master/Child:
 *   FichaAtendimentoIndividualMaster {
 *     1: required string uuidFicha,
 *     2: required VariasLotacoesHeader headerTransport,
 *     3: required i32 tpCdsOrigem,
 *     4: required list<AtendimentoIndividualChild> atendimentosIndividuais,
 *   }
 *
 * Spec: https://integracao.esusaps.bridge.ufsc.tech/ledi/documentacao/atendimento_individual/
 */
import { TBinaryWriter, buildStruct } from "../protocol";
import { writeVariasLotacoesHeader, type VariasLotacoesHeaderInput } from "../header";

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

// Avaliação antropométrica / sinais vitais (struct opcional na ficha)
interface AntropometriaInput {
  peso?: number;     // kg
  altura?: number;   // cm
  perimetroCefalico?: number;
  imc?: number;
}
function writeAntropometria(w: TBinaryWriter, a: AntropometriaInput) {
  if (a.peso != null) { w.writeFieldBegin(4, 1); w.writeDouble(a.peso); }
  if (a.altura != null) { w.writeFieldBegin(4, 2); w.writeDouble(a.altura); }
  if (a.perimetroCefalico != null) { w.writeFieldBegin(4, 3); w.writeDouble(a.perimetroCefalico); }
  if (a.imc != null) { w.writeFieldBegin(4, 4); w.writeDouble(a.imc); }
}

interface ChildInput {
  uuidFichaOrigem: string;
  cnsCidadao?: string | null;
  cpfCidadao?: string | null;
  dtNascimento?: number | null;
  sexoCidadao?: 0 | 1 | null; // 0 F, 1 M
  numProntuario?: string | null;
  localAtendimento?: number;       // 1..04
  turno: number;                   // 1 manhã 2 tarde 3 noite
  tipoAtendimento: number;         // 1 cons agendada 2 cons agend programada 3 cons dia 4 atend urgência
  modalidadeAtencao?: number;      // 1 presencial 2 telessaúde
  condicaoAvaliada?: number[];     // códigos LEDI
  ciaps?: string[];                // até N
  cids10?: string[];               // até N
  exameSolicitado?: string[];      // SIGTAP
  exameAvaliado?: string[];        // SIGTAP
  condutaList: number[];           // 1 retorno consulta agendada / 2 retorno cuidado continuado etc
  encaminhamentoExternoList?: number[];
  encaminhamentoInternoList?: number[];
  racionalidadeSaude?: number;     // medicina/saúde tradicional
  vacinacaoEmDia?: boolean;
  antropometria?: AntropometriaInput;
  procedimentos?: string[];        // SIGTAP procedimentos avulsos
  nasf?: boolean;
}

function writeChild(w: TBinaryWriter, c: ChildInput) {
  w.reqString(1, c.uuidFichaOrigem);
  w.optString(2, c.cnsCidadao);
  w.optString(3, c.cpfCidadao);
  w.optI64(4, c.dtNascimento ?? null);
  if (c.sexoCidadao != null) { w.writeFieldBegin(8, 5); w.writeI32(c.sexoCidadao); }
  w.optString(6, c.numProntuario);
  if (c.localAtendimento != null) { w.writeFieldBegin(8, 7); w.writeI32(c.localAtendimento); }
  w.writeFieldBegin(8, 8); w.writeI32(c.turno);
  w.writeFieldBegin(8, 9); w.writeI32(c.tipoAtendimento);
  if (c.modalidadeAtencao != null) { w.writeFieldBegin(8, 10); w.writeI32(c.modalidadeAtencao); }
  w.optListI64(11, c.condicaoAvaliada);
  w.optListString(12, c.ciaps);
  w.optListString(13, c.cids10);
  w.optListString(14, c.exameSolicitado);
  w.optListString(15, c.exameAvaliado);
  if (c.condutaList.length) w.optListI64(16, c.condutaList);
  w.optListI64(17, c.encaminhamentoExternoList);
  w.optListI64(18, c.encaminhamentoInternoList);
  if (c.racionalidadeSaude != null) { w.writeFieldBegin(8, 19); w.writeI32(c.racionalidadeSaude); }
  w.optBool(20, c.vacinacaoEmDia);
  if (c.antropometria) {
    w.writeFieldBegin(12 /* STRUCT */, 21);
    writeAntropometria(w, c.antropometria);
    w.writeFieldStop();
  }
  w.optListString(22, c.procedimentos);
  w.optBool(23, c.nasf);
}

export interface FaiInput {
  uuidFicha: string;
  header: VariasLotacoesHeaderInput;
  atendimentos: any[]; // rows agendamentos+pacientes (status atendido)
}

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function buildFAIThrift(input: FaiInput): Uint8Array {
  const turnoMap: Record<string, number> = { manha: 1, tarde: 2, noite: 3 };

  const children: ChildInput[] = input.atendimentos.map((a) => {
    const pac = a.pacientes ?? {};
    const cid = a.cid10 ? [String(a.cid10).toUpperCase()] : [];
    const proc = a.procedimentos?.codigo_sigtap ? [a.procedimentos.codigo_sigtap] : [];
    const horaInicio = a.hora_inicio ?? "12:00:00";
    const h = parseInt(String(horaInicio).slice(0, 2), 10);
    const turno = h < 12 ? 1 : h < 18 ? 2 : 3;
    const modalidade = a.modalidade === "telessaude" || a.tele_sala_id ? 2 : 1;

    return {
      uuidFichaOrigem: uuidv4(),
      cnsCidadao: digits(pac.cns),
      cpfCidadao: digits(pac.cpf),
      dtNascimento: epoch(pac.data_nascimento) || null,
      sexoCidadao: pac.sexo === "F" ? 0 : pac.sexo === "M" ? 1 : null,
      numProntuario: pac.numero_prontuario || null,
      localAtendimento: 1, // 1 = UBS
      turno: a.turno_codigo ?? turno,
      tipoAtendimento: a.tipo_atendimento_codigo ?? 1, // 1 = consulta agendada
      modalidadeAtencao: modalidade,
      cids10: cid,
      condutaList: [1], // 1 = retorno consulta agendada (default)
      procedimentos: proc,
    };
  });

  return buildStruct((w) => {
    w.reqString(1, input.uuidFicha);
    w.reqStruct(2, (sw) => writeVariasLotacoesHeader(sw, input.header));
    w.writeFieldBegin(8, 3); w.writeI32(3); // tpCdsOrigem = CDS offline
    w.optListStruct(4, children, (sw, c) => writeChild(sw, c));
  });
}
