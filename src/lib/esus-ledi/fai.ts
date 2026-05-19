// LEDI FAI — Ficha de Atendimento Individual (tipoDadoSerializado=4).
import { create } from "xmlbuilder2";
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces";
import {
  DadoInstalacao, NS4_BY_TIPO, Sexo, TipoDadoSerializado,
  Turno, VERSAO_LEDI_DEFAULT, Versao,
} from "./models";
import {
  digitsOnly, validateCnes, validateCns, validateCpf, validateIbge,
  validateIne, validateUuidLedi, validateCpfOuCnpj,
} from "./validators";
import { makeLediUuid } from "./uuid";

export interface HeaderVariasLotacoes {
  lotacaoFormPrincipal: {
    profissionalCNS: string;
    cboCodigo_2002: string;
    cnes: string;
    ine?: string;
  };
  dataAtendimento: number; // epoch ms
  codigoIbgeMunicipio: string;
}

export interface ProblemaCondicaoAvaliada {
  cid10?: string;
  ciap?: string;
}

export interface MedicoesAvaliadas {
  peso?: number;
  altura?: number;
  perimetroCefalico?: number;
  imc?: number;
  pressaoArterial?: string;
  frequenciaCardiaca?: number;
  frequenciaRespiratoria?: number;
  temperatura?: number;
  saturacao?: number;
}

export interface ExameAvaliado {
  codigoExame: string;
  /** A = avaliado, S = solicitado. */
  solicitadoAvaliado: "A" | "S";
}

export interface AtendimentoIndividual {
  uuidFicha: string;
  numeroProntuario?: string;
  cpfCidadao?: string;
  cnsCidadao?: string;
  dtNascimento?: number;
  sexo?: Sexo;
  localDeAtendimento?: number;
  turno?: Turno;
  tipoAtendimento?: number;
  dataHoraInicialAtendimento?: number;
  dataHoraFinalAtendimento?: number;
  problemasECondicoesAvaliadas: ProblemaCondicaoAvaliada[];
  medicoes?: MedicoesAvaliadas;
  exames: ExameAvaliado[];
  condutas: number[];
}

export interface FichaAtendimentoIndividualMaster {
  uuidFicha: string;
  tpCdsOrigem: 3;
  headerVariasLotacoes: HeaderVariasLotacoes;
  atendimentosIndividuais: AtendimentoIndividual[];
}

export interface DadoTransporteFai {
  uuidDadoSerializado: string;
  tipoDadoSerializado: TipoDadoSerializado.ATENDIMENTO_INDIVIDUAL;
  codIbge: string;
  cnesDadoSerializado: string;
  ineDadoSerializado?: string;
  numLote: number | bigint;
  ficha: FichaAtendimentoIndividualMaster;
  remetente: DadoInstalacao;
  originadora: DadoInstalacao;
  versao: Versao;
}

const TURNO_MAP: Record<string, Turno> = {
  manha: 1, "manhã": 1, m: 1,
  tarde: 2, t: 2,
  noite: 3, n: 3,
};
const SEXO_MAP: Record<string, Sexo> = { F: 0, FEMININO: 0, M: 1, MASCULINO: 1 };

export interface AtendimentoRowDb {
  id: string;
  turno?: string | null;
  created_at?: string | null;
  finalizado_em?: string | null;
  cids?: string[] | null;
  ciaps?: string[] | null;
  exames_avaliados?: string[] | null;
  exames_solicitados?: string[] | null;
  peso?: number | string | null;
  altura?: number | string | null;
  perimetro_cefalico?: number | string | null;
  imc?: number | string | null;
  pa?: string | null;
  fc?: string | null;
  fr?: string | null;
  temperatura?: string | null;
  saturacao?: string | null;
  pacientes?: {
    cpf?: string | null;
    cns?: string | null;
    data_nascimento?: string | null;
    sexo?: string | null;
  } | null;
}

function epochMs(d: string | null | undefined): number | undefined {
  if (!d) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : d;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

function toNum(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function atendimentoFromDb(
  a: AtendimentoRowDb,
  cnes: string,
  dataAtendimentoFallback: number,
): AtendimentoIndividual {
  const p = a.pacientes ?? {};
  const cpf = digitsOnly(p.cpf ?? "");
  const cns = digitsOnly(p.cns ?? "");
  const cids = (a.cids ?? []).filter(Boolean);
  const ciaps = (a.ciaps ?? []).filter(Boolean);
  const problemas: ProblemaCondicaoAvaliada[] = [
    ...cids.map((c) => ({ cid10: c })),
    ...ciaps.map((c) => ({ ciap: c })),
  ];
  const exames: ExameAvaliado[] = [
    ...((a.exames_avaliados ?? []).filter(Boolean).map((c) => ({ codigoExame: c, solicitadoAvaliado: "A" as const }))),
    ...((a.exames_solicitados ?? []).filter(Boolean).map((c) => ({ codigoExame: c, solicitadoAvaliado: "S" as const }))),
  ];
  const medicoes: MedicoesAvaliadas = {
    peso: toNum(a.peso),
    altura: toNum(a.altura),
    perimetroCefalico: toNum(a.perimetro_cefalico),
    imc: toNum(a.imc),
    pressaoArterial: a.pa ?? undefined,
    frequenciaCardiaca: toNum(a.fc),
    frequenciaRespiratoria: toNum(a.fr),
    temperatura: toNum(a.temperatura),
    saturacao: toNum(a.saturacao),
  };
  const inicio = epochMs(a.created_at) ?? dataAtendimentoFallback;
  const fim = epochMs(a.finalizado_em) ?? inicio;
  return {
    uuidFicha: makeLediUuid(cnes),
    numeroProntuario: a.id.slice(0, 12),
    cpfCidadao: cpf || undefined,
    cnsCidadao: !cpf && cns ? cns : undefined,
    dtNascimento: epochMs(p.data_nascimento ?? null),
    sexo: SEXO_MAP[String(p.sexo ?? "").toUpperCase()],
    localDeAtendimento: 1,
    turno: TURNO_MAP[String(a.turno ?? "").toLowerCase()],
    tipoAtendimento: 1,
    dataHoraInicialAtendimento: inicio,
    dataHoraFinalAtendimento: fim,
    problemasECondicoesAvaliadas: problemas,
    medicoes,
    exames,
    condutas: [1],
  };
}

function appendHeaderVarias(parent: XMLBuilder, h: HeaderVariasLotacoes): void {
  const e = parent.ele("headerTransport");
  const lot = e.ele("lotacaoFormPrincipal");
  lot.ele("profissionalCNS").txt(validateCns(h.lotacaoFormPrincipal.profissionalCNS));
  lot.ele("cboCodigo_2002").txt(digitsOnly(h.lotacaoFormPrincipal.cboCodigo_2002));
  lot.ele("cnes").txt(validateCnes(h.lotacaoFormPrincipal.cnes));
  if (h.lotacaoFormPrincipal.ine) lot.ele("ine").txt(validateIne(h.lotacaoFormPrincipal.ine));
  e.ele("dataAtendimento").txt(String(h.dataAtendimento));
  e.ele("codigoIbgeMunicipio").txt(validateIbge(h.codigoIbgeMunicipio));
}

function appendAtendimento(parent: XMLBuilder, a: AtendimentoIndividual): void {
  const e = parent.ele("atendimentosIndividuais");
  e.ele("uuidFicha").txt(validateUuidLedi(a.uuidFicha));
  if (a.numeroProntuario) e.ele("numeroProntuario").txt(a.numeroProntuario);
  if (a.cpfCidadao) e.ele("cpfCidadao").txt(validateCpf(a.cpfCidadao));
  if (!a.cpfCidadao && a.cnsCidadao) e.ele("cnsCidadao").txt(validateCns(a.cnsCidadao));
  if (a.dtNascimento != null) e.ele("dataNascimento").txt(String(a.dtNascimento));
  if (a.sexo != null) e.ele("sexo").txt(String(a.sexo));
  if (a.localDeAtendimento != null) e.ele("localDeAtendimento").txt(String(a.localDeAtendimento));
  if (a.turno != null) e.ele("turno").txt(String(a.turno));
  if (a.tipoAtendimento != null) e.ele("tipoAtendimento").txt(String(a.tipoAtendimento));
  if (a.dataHoraInicialAtendimento != null) e.ele("dataHoraInicialAtendimento").txt(String(a.dataHoraInicialAtendimento));
  if (a.dataHoraFinalAtendimento != null) e.ele("dataHoraFinalAtendimento").txt(String(a.dataHoraFinalAtendimento));
  for (const pc of a.problemasECondicoesAvaliadas) {
    const p = e.ele("problemasECondicoesAvaliadas");
    if (pc.cid10) p.ele("cid10").txt(pc.cid10);
    if (pc.ciap) p.ele("ciap").txt(pc.ciap);
    p.ele("isAvaliado").txt("true");
  }
  const m = a.medicoes;
  if (m && Object.values(m).some((v) => v != null && v !== "")) {
    const mE = e.ele("medicoes");
    if (m.peso != null) mE.ele("peso").txt(String(m.peso));
    if (m.altura != null) mE.ele("altura").txt(String(m.altura));
    if (m.perimetroCefalico != null) mE.ele("perimetroCefalico").txt(String(m.perimetroCefalico));
    if (m.imc != null) mE.ele("imc").txt(String(m.imc));
    if (m.pressaoArterial) mE.ele("pressaoArterial").txt(m.pressaoArterial);
    if (m.frequenciaCardiaca != null) mE.ele("frequenciaCardiaca").txt(String(m.frequenciaCardiaca));
    if (m.frequenciaRespiratoria != null) mE.ele("frequenciaRespiratoria").txt(String(m.frequenciaRespiratoria));
    if (m.temperatura != null) mE.ele("temperatura").txt(String(m.temperatura));
    if (m.saturacao != null) mE.ele("saturacao").txt(String(m.saturacao));
  }
  for (const ex of a.exames) {
    const x = e.ele("exame");
    x.ele("codigoExame").txt(ex.codigoExame);
    x.ele("solicitadoAvaliado").txt(ex.solicitadoAvaliado);
  }
  for (const c of a.condutas) e.ele("condutas").txt(String(c));
}

function appendInstalacao(parent: XMLBuilder, qname: string, d: DadoInstalacao): void {
  const e = parent.ele(qname);
  e.ele("contraChave").txt(d.contraChave);
  e.ele("uuidInstalacao").txt(d.uuidInstalacao);
  e.ele("cpfOuCnpj").txt(validateCpfOuCnpj(d.cpfOuCnpj));
  e.ele("nomeOuRazaoSocial").txt(d.nomeOuRazaoSocial);
  e.ele("versaoSistema").txt(d.versaoSistema);
}

export function serializeDadoTransporteFai(dt: DadoTransporteFai): string {
  const ns4 = NS4_BY_TIPO[TipoDadoSerializado.ATENDIMENTO_INDIVIDUAL];
  const doc = create({ version: "1.0", encoding: "UTF-8", standalone: true });
  const root = doc.ele("ns3:dadoTransporteTransportXml", {
    "xmlns:ns2": "http://esus.ufsc.br/dadoinstalacao",
    "xmlns:ns3": "http://esus.ufsc.br/dadotransporte",
    "xmlns:ns4": ns4,
  });
  root.ele("uuidDadoSerializado").txt(validateUuidLedi(dt.uuidDadoSerializado));
  root.ele("tipoDadoSerializado").txt(String(dt.tipoDadoSerializado));
  root.ele("codIbge").txt(validateIbge(dt.codIbge));
  root.ele("cnesDadoSerializado").txt(validateCnes(dt.cnesDadoSerializado));
  if (dt.ineDadoSerializado) root.ele("ineDadoSerializado").txt(validateIne(dt.ineDadoSerializado));
  root.ele("numLote").txt(String(dt.numLote));
  const ficha = root.ele("ns4:fichaAtendimentoIndividualMasterTransport");
  ficha.ele("uuidFicha").txt(validateUuidLedi(dt.ficha.uuidFicha));
  ficha.ele("tpCdsOrigem").txt(String(dt.ficha.tpCdsOrigem));
  appendHeaderVarias(ficha, dt.ficha.headerVariasLotacoes);
  for (const a of dt.ficha.atendimentosIndividuais) appendAtendimento(ficha, a);
  appendInstalacao(root, "ns2:remetente", dt.remetente);
  appendInstalacao(root, "ns2:originadora", dt.originadora);
  const v = root.ele("versao");
  v.att("major", String(dt.versao.major));
  v.att("minor", String(dt.versao.minor));
  v.att("revision", String(dt.versao.revision));
  return doc.end({ prettyPrint: false });
}

export const VERSAO_FAI_DEFAULT = VERSAO_LEDI_DEFAULT;
