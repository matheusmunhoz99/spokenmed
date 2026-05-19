// LEDI FCD — Ficha de Cadastro Domiciliar (tipoDadoSerializado=2).
import { create } from "xmlbuilder2";
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces";
import {
  DadoInstalacao, HeaderTransport, NS4_BY_TIPO, TipoDadoSerializado,
  VERSAO_LEDI_DEFAULT, Versao,
} from "./models";
import {
  digitsOnly, validateCnes, validateCns, validateIbge, validateIne,
  validateUuidLedi, validateCpfOuCnpj,
} from "./validators";
import { makeLediUuid } from "./uuid";

export interface EnderecoDomiciliar {
  bairro: string;
  cep?: string;
  logradouro: string;
  numero?: string;
  stSemNumero: boolean;
  tipoLogradouroNumeroDne?: string;
  complemento?: string;
  pontoReferencia?: string;
  telefoneContato?: string;
  municipio: string; // IBGE
  uf?: string;
}

export interface CadastroDomiciliar {
  uuidFicha: string;
  endereco: EnderecoDomiciliar;
  stStatusTermoRecusa: boolean;
  tipoDeImovel?: number;
  condicaoMoradia?: {
    tipoDomicilio?: number;
    materialPredominanteParedes?: number;
    numComodos?: number;
    numMoradores?: number;
    aguaCanalizada?: boolean;
    abastecimentoAgua?: number;
    formaEscoamentoBanheiro?: number;
    destinoLixo?: number;
    tratamentoAguaDomicilio?: number;
    possuiEnergiaEletrica?: boolean;
  };
  microArea?: string;
  stForaArea?: boolean;
  localizacao?: number;
}

export interface FichaCadastroDomiciliarMaster {
  uuidFicha: string;
  tpCdsOrigem: 3;
  headerTransport: HeaderTransport;
  cadastrosDomiciliares: CadastroDomiciliar[];
}

export interface DadoTransporteFcd {
  uuidDadoSerializado: string;
  tipoDadoSerializado: TipoDadoSerializado.CADASTRO_DOMICILIAR;
  codIbge: string;
  cnesDadoSerializado: string;
  ineDadoSerializado?: string;
  numLote: number | bigint;
  ficha: FichaCadastroDomiciliarMaster;
  remetente: DadoInstalacao;
  originadora: DadoInstalacao;
  versao: Versao;
}

export interface DomicilioRowDb {
  id: string;
  uuid_ficha?: string | null;
  logradouro: string;
  numero?: string | null;
  sem_numero?: boolean | null;
  bairro: string;
  cep?: string | null;
  complemento?: string | null;
  ponto_referencia?: string | null;
  telefone_contato?: string | null;
  tipo_imovel?: number | string | null;
  microarea?: string | null;
  fora_area?: boolean | null;
  termo_recusa?: boolean | null;
  num_comodos?: number | null;
  num_moradores?: number | null;
  abastecimento_agua?: number | string | null;
  energia_eletrica?: boolean | null;
  destino_lixo?: number | string | null;
  esgoto?: number | string | null;
  agua_consumo?: number | string | null;
  localizacao?: number | string | null;
  uf?: string | null;
}

function toInt(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function cadastroDomiciliarFromDb(
  d: DomicilioRowDb,
  cnes: string,
  codIbge: string,
): CadastroDomiciliar {
  const uuid = d.uuid_ficha
    ? `${cnes}-${d.uuid_ficha}`
    : makeLediUuid(cnes);
  return {
    uuidFicha: uuid,
    endereco: {
      bairro: d.bairro,
      cep: d.cep ? digitsOnly(d.cep) : undefined,
      logradouro: d.logradouro,
      numero: d.numero ?? undefined,
      stSemNumero: !!d.sem_numero,
      tipoLogradouroNumeroDne: "081",
      complemento: d.complemento ?? undefined,
      pontoReferencia: d.ponto_referencia ?? undefined,
      telefoneContato: d.telefone_contato ? digitsOnly(d.telefone_contato) : undefined,
      municipio: codIbge,
      uf: d.uf ?? undefined,
    },
    stStatusTermoRecusa: !!d.termo_recusa,
    tipoDeImovel: toInt(d.tipo_imovel),
    microArea: d.microarea ?? undefined,
    stForaArea: !!d.fora_area,
    localizacao: toInt(d.localizacao),
    condicaoMoradia: {
      numComodos: toInt(d.num_comodos),
      numMoradores: toInt(d.num_moradores),
      abastecimentoAgua: toInt(d.abastecimento_agua),
      formaEscoamentoBanheiro: toInt(d.esgoto),
      destinoLixo: toInt(d.destino_lixo),
      tratamentoAguaDomicilio: toInt(d.agua_consumo),
      possuiEnergiaEletrica: d.energia_eletrica ?? undefined,
    },
  };
}

function appendHeader(parent: XMLBuilder, h: HeaderTransport): void {
  const e = parent.ele("headerTransport");
  e.ele("profissionalCNS").txt(validateCns(h.profissionalCNS));
  e.ele("cboCodigo_2002").txt(digitsOnly(h.cboCodigo_2002));
  e.ele("cnes").txt(validateCnes(h.cnes));
  if (h.ine) e.ele("ine").txt(validateIne(h.ine));
  e.ele("dataAtendimento").txt(String(h.dataAtendimento));
  e.ele("codigoIbgeMunicipio").txt(validateIbge(h.codigoIbgeMunicipio));
}

function appendEndereco(parent: XMLBuilder, end: EnderecoDomiciliar): void {
  const e = parent.ele("enderecoLocalPermanencia");
  e.ele("bairro").txt(end.bairro);
  if (end.cep) e.ele("cep").txt(end.cep);
  e.ele("logradouro").txt(end.logradouro);
  if (end.numero) e.ele("numero").txt(end.numero);
  e.ele("stSemNumero").txt(end.stSemNumero ? "true" : "false");
  if (end.tipoLogradouroNumeroDne) e.ele("tipoLogradouroNumeroDne").txt(end.tipoLogradouroNumeroDne);
  if (end.complemento) e.ele("complemento").txt(end.complemento);
  if (end.pontoReferencia) e.ele("pontoReferencia").txt(end.pontoReferencia);
  if (end.telefoneContato) e.ele("telefoneContato").txt(end.telefoneContato);
  e.ele("municipio").txt(validateIbge(end.municipio));
  if (end.uf) e.ele("uf").txt(end.uf);
}

function appendCadastro(parent: XMLBuilder, c: CadastroDomiciliar): void {
  const e = parent.ele("cadastrosDomiciliares");
  e.ele("uuidFicha").txt(validateUuidLedi(c.uuidFicha));
  appendEndereco(e, c.endereco);
  e.ele("stStatusTermoRecusaCadastroDomiciliarAtencaoBasica")
    .txt(c.stStatusTermoRecusa ? "true" : "false");
  if (c.tipoDeImovel != null) e.ele("tipoDeImovel").txt(String(c.tipoDeImovel));
  if (c.microArea) e.ele("microArea").txt(c.microArea);
  if (c.stForaArea != null) e.ele("stForaArea").txt(c.stForaArea ? "true" : "false");
  if (c.localizacao != null) e.ele("localizacao").txt(String(c.localizacao));
  const cm = c.condicaoMoradia;
  if (cm && Object.values(cm).some((v) => v != null)) {
    const cmE = e.ele("condicaoMoradia");
    if (cm.numComodos != null) cmE.ele("numComodos").txt(String(cm.numComodos));
    if (cm.numMoradores != null) cmE.ele("numMoradores").txt(String(cm.numMoradores));
    if (cm.abastecimentoAgua != null) cmE.ele("abastecimentoAgua").txt(String(cm.abastecimentoAgua));
    if (cm.formaEscoamentoBanheiro != null) cmE.ele("formaEscoamentoBanheiro").txt(String(cm.formaEscoamentoBanheiro));
    if (cm.destinoLixo != null) cmE.ele("destinoLixo").txt(String(cm.destinoLixo));
    if (cm.tratamentoAguaDomicilio != null) cmE.ele("tratamentoAguaNoDomicilio").txt(String(cm.tratamentoAguaDomicilio));
    if (cm.possuiEnergiaEletrica != null) cmE.ele("possuiEnergiaEletrica").txt(cm.possuiEnergiaEletrica ? "true" : "false");
  }
}

function appendInstalacao(parent: XMLBuilder, qname: string, d: DadoInstalacao): void {
  const e = parent.ele(qname);
  e.ele("contraChave").txt(d.contraChave);
  e.ele("uuidInstalacao").txt(d.uuidInstalacao);
  e.ele("cpfOuCnpj").txt(validateCpfOuCnpj(d.cpfOuCnpj));
  e.ele("nomeOuRazaoSocial").txt(d.nomeOuRazaoSocial);
  e.ele("versaoSistema").txt(d.versaoSistema);
}

export function serializeDadoTransporteFcd(dt: DadoTransporteFcd): string {
  const ns4 = NS4_BY_TIPO[TipoDadoSerializado.CADASTRO_DOMICILIAR];
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
  if (dt.ineDadoSerializado) {
    root.ele("ineDadoSerializado").txt(validateIne(dt.ineDadoSerializado));
  }
  root.ele("numLote").txt(String(dt.numLote));
  const ficha = root.ele("ns4:fichaCadastroDomiciliarMasterTransport");
  ficha.ele("uuidFicha").txt(validateUuidLedi(dt.ficha.uuidFicha));
  ficha.ele("tpCdsOrigem").txt(String(dt.ficha.tpCdsOrigem));
  appendHeader(ficha, dt.ficha.headerTransport);
  for (const c of dt.ficha.cadastrosDomiciliares) appendCadastro(ficha, c);
  appendInstalacao(root, "ns2:remetente", dt.remetente);
  appendInstalacao(root, "ns2:originadora", dt.originadora);
  const v = root.ele("versao");
  v.att("major", String(dt.versao.major));
  v.att("minor", String(dt.versao.minor));
  v.att("revision", String(dt.versao.revision));
  return doc.end({ prettyPrint: false });
}

export const VERSAO_FCD_DEFAULT = VERSAO_LEDI_DEFAULT;
