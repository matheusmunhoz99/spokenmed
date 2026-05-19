/**
 * Builders mínimos para as fichas LEDI 7.4 que ainda não têm tabela de origem
 * no banco (FAC, FP, FVD, FMCA, FAE, FCZM, FV).
 *
 * Cada função produz a estrutura Master (uuidFicha + headerTransport +
 * tpCdsOrigem + list<Child>) e é registrada em transporte.ts. Os children
 * são criados a partir de `rows: any[]`. Quando `rows` está vazio o exportador
 * simplesmente não adiciona a ficha ao lote, então o esqueleto é seguro.
 *
 * À medida que as tabelas de origem forem criadas, expanda `writeChild()`
 * com os campos do XSD oficial de cada ficha.
 */
import { TBinaryWriter, buildStruct } from "../protocol";
import {
  writeUnicaLotacaoHeader,
  writeVariasLotacoesHeader,
  type UnicaLotacaoHeaderInput,
  type VariasLotacoesHeaderInput,
} from "../header";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function epoch(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isFinite(x.getTime()) ? x.getTime() : null;
}

function digits(v: string | null | undefined): string | null {
  if (!v) return null;
  const c = v.replace(/\D/g, "");
  return c.length ? c : null;
}

interface MasterInput<H> {
  uuidFicha: string;
  header: H;
  rows: any[];
  tpCdsOrigem?: number; // 3 = CDS offline
}

/** Master genérico com VariasLotacoesHeader (FAC, FP, FAE, FV). */
function buildMasterVarias(
  m: MasterInput<VariasLotacoesHeaderInput>,
  writeChild: (w: TBinaryWriter, row: any) => void,
): Uint8Array {
  return buildStruct((w) => {
    w.reqString(1, m.uuidFicha);
    w.reqStruct(2, (sw) => writeVariasLotacoesHeader(sw, m.header));
    w.writeFieldBegin(8, 3); w.writeI32(m.tpCdsOrigem ?? 3);
    w.optListStruct(4, m.rows, writeChild);
  });
}

/** Master genérico com UnicaLotacaoHeader (FVD, FMCA, FCZM). */
function buildMasterUnica(
  m: MasterInput<UnicaLotacaoHeaderInput>,
  writeChild: (w: TBinaryWriter, row: any) => void,
): Uint8Array {
  return buildStruct((w) => {
    w.reqString(1, m.uuidFicha);
    w.reqStruct(2, (sw) => writeUnicaLotacaoHeader(sw, m.header));
    w.writeFieldBegin(8, 3); w.writeI32(m.tpCdsOrigem ?? 3);
    w.optListStruct(4, m.rows, writeChild);
  });
}

// ------------------- FAC (Ficha de Atividade Coletiva) -------------------
export interface FacInput {
  uuidFicha: string;
  header: VariasLotacoesHeaderInput;
  atividades: any[];
}
export function buildFACThrift(i: FacInput): Uint8Array {
  return buildMasterVarias(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.atividades },
    (w, a) => {
      w.reqString(1, a.uuidFichaOrigem ?? uuid());
      if (a.dataAtividade) w.optI64(2, epoch(a.dataAtividade));
      if (a.programaSaudeNaEscola != null) w.optBool(3, a.programaSaudeNaEscola);
      if (a.turno != null) { w.writeFieldBegin(8, 4); w.writeI32(a.turno); }
      if (a.tipoAtividade != null) { w.writeFieldBegin(8, 5); w.writeI32(a.tipoAtividade); }
      w.optString(6, a.cnesLocal);
      w.optListString(7, a.publicoAlvo);
      w.optListString(8, a.temasParaReuniao);
      w.optListString(9, a.temasParaSaude);
      w.optListString(10, a.praticasEmSaude);
      w.optListString(11, a.participantes);
    },
  );
}

// ------------------- FP (Ficha de Procedimentos) -------------------
export interface FpInput {
  uuidFicha: string;
  header: VariasLotacoesHeaderInput;
  procedimentos: any[];
}
export function buildFPThrift(i: FpInput): Uint8Array {
  return buildMasterVarias(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.procedimentos },
    (w, p) => {
      w.reqString(1, p.uuidFichaOrigem ?? uuid());
      if (p.dataAtendimento) w.optI64(2, epoch(p.dataAtendimento));
      if (p.turno != null) { w.writeFieldBegin(8, 3); w.writeI32(p.turno); }
      w.optString(4, digits(p.cnsCidadao));
      w.optString(5, digits(p.cpfCidadao));
      if (p.dtNascimento) w.optI64(6, epoch(p.dtNascimento));
      if (p.sexo != null) { w.writeFieldBegin(8, 7); w.writeI32(p.sexo); }
      w.optListString(8, p.procedimentosSigtap);
      w.optListString(9, p.cids10);
      if (p.localAtendimento != null) { w.writeFieldBegin(8, 10); w.writeI32(p.localAtendimento); }
    },
  );
}

// ------------------- FVD (Ficha de Visita Domiciliar) -------------------
export interface FvdInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  visitas: any[];
}
export function buildFVDThrift(i: FvdInput): Uint8Array {
  return buildMasterUnica(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.visitas },
    (w, v) => {
      w.reqString(1, v.uuidFichaOrigem ?? uuid());
      w.optString(2, digits(v.cnsCidadao));
      w.optString(3, digits(v.cpfCidadao));
      if (v.dataVisita) w.optI64(4, epoch(v.dataVisita));
      if (v.turno != null) { w.writeFieldBegin(8, 5); w.writeI32(v.turno); }
      w.optListI64(6, v.motivosVisita);
      if (v.desfecho != null) { w.writeFieldBegin(8, 7); w.writeI32(v.desfecho); }
      w.optString(8, v.microarea);
      w.optBool(9, v.foraArea);
      w.optListI64(10, v.buscaAtiva);
      w.optListI64(11, v.acompanhamento);
      w.optListI64(12, v.controleAmbiental);
    },
  );
}

// ------------------- FMCA (Marcadores de Consumo Alimentar) -------------------
export interface FmcaInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  marcadores: any[];
}
export function buildFMCAThrift(i: FmcaInput): Uint8Array {
  return buildMasterUnica(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.marcadores },
    (w, m) => {
      w.reqString(1, m.uuidFichaOrigem ?? uuid());
      w.optString(2, digits(m.cnsCidadao));
      w.optString(3, digits(m.cpfCidadao));
      if (m.dtNascimento) w.optI64(4, epoch(m.dtNascimento));
      if (m.sexo != null) { w.writeFieldBegin(8, 5); w.writeI32(m.sexo); }
      if (m.faixaEtaria != null) { w.writeFieldBegin(8, 6); w.writeI32(m.faixaEtaria); }
      w.optListI64(7, m.respostas);
      if (m.localAtendimento != null) { w.writeFieldBegin(8, 8); w.writeI32(m.localAtendimento); }
    },
  );
}

// ------------------- FAE (Atendimento Especializado / NASF / CEO) -------------------
export interface FaeInput {
  uuidFicha: string;
  header: VariasLotacoesHeaderInput;
  atendimentos: any[];
}
export function buildFAEThrift(i: FaeInput): Uint8Array {
  return buildMasterVarias(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.atendimentos },
    (w, a) => {
      w.reqString(1, a.uuidFichaOrigem ?? uuid());
      w.optString(2, digits(a.cnsCidadao));
      w.optString(3, digits(a.cpfCidadao));
      if (a.dtNascimento) w.optI64(4, epoch(a.dtNascimento));
      if (a.sexo != null) { w.writeFieldBegin(8, 5); w.writeI32(a.sexo); }
      if (a.localAtendimento != null) { w.writeFieldBegin(8, 6); w.writeI32(a.localAtendimento); }
      if (a.turno != null) { w.writeFieldBegin(8, 7); w.writeI32(a.turno); }
      if (a.tipoAtendimento != null) { w.writeFieldBegin(8, 8); w.writeI32(a.tipoAtendimento); }
      w.optListString(9, a.cids10);
      w.optListString(10, a.ciaps);
      w.optListString(11, a.procedimentosSigtap);
      w.optListI64(12, a.condutas);
    },
  );
}

// ------------------- FCZM (Zika/Microcefalia) -------------------
export interface FczmInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  avaliacoes: any[];
}
export function buildFCZMThrift(i: FczmInput): Uint8Array {
  return buildMasterUnica(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.avaliacoes },
    (w, a) => {
      w.reqString(1, a.uuidFichaOrigem ?? uuid());
      w.optString(2, digits(a.cnsCidadao));
      w.optString(3, digits(a.cpfCidadao));
      if (a.dataAvaliacao) w.optI64(4, epoch(a.dataAvaliacao));
      if (a.perimetroCefalico != null) w.optDouble(5, Number(a.perimetroCefalico));
      if (a.peso != null) w.optDouble(6, Number(a.peso));
      if (a.altura != null) w.optDouble(7, Number(a.altura));
      w.optListI64(8, a.atrasoDesenvolvimento);
      w.optListI64(9, a.encaminhamentos);
    },
  );
}

// ------------------- FV (Vacinação) -------------------
export interface FvInput {
  uuidFicha: string;
  header: VariasLotacoesHeaderInput;
  vacinacoes: any[];
}
export function buildFVThrift(i: FvInput): Uint8Array {
  return buildMasterVarias(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.vacinacoes },
    (w, v) => {
      w.reqString(1, v.uuidFichaOrigem ?? uuid());
      w.optString(2, digits(v.cnsCidadao));
      w.optString(3, digits(v.cpfCidadao));
      if (v.dtNascimento) w.optI64(4, epoch(v.dtNascimento));
      if (v.sexo != null) { w.writeFieldBegin(8, 5); w.writeI32(v.sexo); }
      if (v.dataVacinacao) w.optI64(6, epoch(v.dataVacinacao));
      if (v.localAtendimento != null) { w.writeFieldBegin(8, 7); w.writeI32(v.localAtendimento); }
      w.optString(8, v.codigoImunobiologico);
      w.optString(9, v.dose);
      w.optString(10, v.estrategia);
      w.optString(11, v.viaAdministracao);
      w.optString(12, v.lote);
      w.optBool(13, v.gestante);
      w.optBool(14, v.viajante);
    },
  );
}
