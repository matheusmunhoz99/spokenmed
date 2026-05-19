// Identidade SpokenMed nos campos fixos remetente/originadora + envelope <ns3:dadoTransporteTransportXml>.
import { escapeXml, tag } from "./escape";

export const SPOKENMED_IDENTIDADE = {
  contraChave: "SpokenMED SIS - 1.0.0",
  cpfOuCnpj: "00000000000000",
  versaoSistema: "1.0.0",
  nomeBase: "SpokenMED SIS - 1.0.0",
} as const;

export type TipoFichaSigla = "FAI" | "FVD" | "FCI" | "FCD" | "FAO";

export const TIPO_DADO_SERIALIZADO: Record<TipoFichaSigla, number> = {
  FCI: 1,
  FCD: 2,
  FAI: 4,
  FAO: 5,
  FVD: 8,
};

export const TIPO_SIGLA_UUID: Record<TipoFichaSigla, string> = {
  FAI: "FDAI",
  FVD: "FDVD",
  FCI: "FDCI",
  FCD: "FDCD",
  FAO: "FDAO",
};

const NS3_BY_TIPO: Record<TipoFichaSigla, string> = {
  FAI: "http://esus.ufsc.br/fichaatendimentoindividualmaster",
  FVD: "http://esus.ufsc.br/fichavisitadomiciliarmaster",
  FCI: "http://esus.ufsc.br/fichacadastroindividualmaster",
  FCD: "http://esus.ufsc.br/fichacadastrodomiciliarmaster",
  FAO: "http://esus.ufsc.br/fichaatendimentoodontologicomaster",
};

const NS4_ROOT_BY_TIPO: Record<TipoFichaSigla, string> = {
  FAI: "fichaAtendimentoIndividualMasterTransport",
  FVD: "fichaVisitaDomiciliarMasterTransport",
  FCI: "fichaCadastroIndividualMasterTransport",
  FCD: "fichaCadastroDomiciliarMasterTransport",
  FAO: "fichaAtendimentoOdontologicoMasterTransport",
};

function rand10(): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** Padrão visto nos exemplos Fiorilli: {CNES}-{10digits}-{SIGLA}-0000-0000-{10digits}. */
export function gerarUuidDadoSerializado(
  cnes: string,
  tipo: TipoFichaSigla,
  numLote: number | bigint,
): string {
  const seq = String(numLote).padStart(10, "0").slice(-10);
  return `${cnes}-${rand10()}-${TIPO_SIGLA_UUID[tipo]}-0000-0000-${seq}`;
}

export interface EnvelopeInput {
  tipo: TipoFichaSigla;
  uuidDadoSerializado: string;
  codIbge: string;
  cnes: string;
  ine?: string | null;
  numLote: number | bigint;
  loteUuid: string; // usado como uuidInstalacao
  /** Conteúdo interno do <ns4:fichaXxxxMasterTransport> (sem o wrapper). */
  conteudoMasterInterno: string;
}

function blocoInstalacao(siglaSufixo: TipoFichaSigla, loteUuid: string): string {
  const nome = `${SPOKENMED_IDENTIDADE.nomeBase} - ${siglaSufixo}`;
  return (
    tag("contraChave", SPOKENMED_IDENTIDADE.contraChave) +
    tag("uuidInstalacao", loteUuid) +
    tag("cpfOuCnpj", SPOKENMED_IDENTIDADE.cpfOuCnpj) +
    tag("nomeOuRazaoSocial", nome) +
    tag("versaoSistema", SPOKENMED_IDENTIDADE.versaoSistema)
  );
}

export function montarEnvelope(e: EnvelopeInput): string {
  const ns3Uri = NS3_BY_TIPO[e.tipo];
  const ns4Root = NS4_ROOT_BY_TIPO[e.tipo];
  const tipoNum = TIPO_DADO_SERIALIZADO[e.tipo];
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<!-- *************************************************** -->` +
    `<!-- *             SPOKENMED SIS LTDA                   * -->` +
    `<!-- *             SISTEMA INTEGRADO DE SAUDE          * -->` +
    `<!-- *************************************************** -->` +
    `<ns3:dadoTransporteTransportXml ` +
    `xmlns:ns2="http://esus.ufsc.br/dadoinstalacao" ` +
    `xmlns:ns3="http://esus.ufsc.br/dadotransporte" ` +
    `xmlns:ns4="${escapeXml(ns3Uri)}">` +
    tag("uuidDadoSerializado", e.uuidDadoSerializado) +
    tag("tipoDadoSerializado", tipoNum) +
    tag("codIbge", e.codIbge) +
    tag("cnesDadoSerializado", e.cnes) +
    (e.ine ? tag("ineDadoSerializado", e.ine) : "") +
    tag("numLote", String(e.numLote)) +
    `<ns4:${ns4Root}>` +
    e.conteudoMasterInterno +
    `</ns4:${ns4Root}>` +
    `<ns2:remetente>` + blocoInstalacao(e.tipo, e.loteUuid) + `</ns2:remetente>` +
    `<ns2:originadora>` + blocoInstalacao(e.tipo, e.loteUuid) + `</ns2:originadora>` +
    `<versao major="6" minor="3" revision="5"/>` +
    `</ns3:dadoTransporteTransportXml>`;
  return xml;
}

export interface HeaderTransport {
  profissionalCNS: string;
  cboCodigo_2002: string;
  cnes: string;
  ine?: string | null;
  dataAtendimentoEpochMs: number;
  codigoIbgeMunicipio: string;
}

/** Header com lotacaoFormPrincipal (usado em FAI/FAO). */
export function renderHeaderVariasLotacoes(h: HeaderTransport): string {
  return (
    `<headerTransport>` +
    `<lotacaoFormPrincipal>` +
    tag("profissionalCNS", h.profissionalCNS) +
    tag("cboCodigo_2002", h.cboCodigo_2002) +
    tag("cnes", h.cnes) +
    (h.ine ? tag("ine", h.ine) : "") +
    `</lotacaoFormPrincipal>` +
    tag("dataAtendimento", h.dataAtendimentoEpochMs) +
    tag("codigoIbgeMunicipio", h.codigoIbgeMunicipio) +
    `</headerTransport>`
  );
}

/** Header plano (usado em FVD/FCI/FCD). */
export function renderHeaderUnicaLotacao(h: HeaderTransport): string {
  return (
    `<headerTransport>` +
    tag("profissionalCNS", h.profissionalCNS) +
    tag("cboCodigo_2002", h.cboCodigo_2002) +
    tag("cnes", h.cnes) +
    (h.ine ? tag("ine", h.ine) : "") +
    tag("dataAtendimento", h.dataAtendimentoEpochMs) +
    tag("codigoIbgeMunicipio", h.codigoIbgeMunicipio) +
    `</headerTransport>`
  );
}
