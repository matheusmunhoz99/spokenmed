// Serializadores XML LEDI usando xmlbuilder2 (escape e ordem garantidos).
import { create, fragment } from "xmlbuilder2";
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces";
import {
  DadoInstalacao, DadoTransporte, FichaVisitaDomiciliarMaster,
  HeaderTransport, NS4_BY_TIPO, VisitaDomiciliar, VERSAO_LEDI_DEFAULT,
  TipoDadoSerializado,
} from "./models";
import {
  validateCnes, validateIbge, validateIne, validateUuidLedi, validateCpfOuCnpj,
  validateCpf, validateCns, digitsOnly,
} from "./validators";

function appendHeader(parent: XMLBuilder, h: HeaderTransport): void {
  const e = parent.ele("headerTransport");
  e.ele("profissionalCNS").txt(validateCns(h.profissionalCNS));
  e.ele("cboCodigo_2002").txt(digitsOnly(h.cboCodigo_2002));
  e.ele("cnes").txt(validateCnes(h.cnes));
  if (h.ine) e.ele("ine").txt(validateIne(h.ine));
  e.ele("dataAtendimento").txt(String(h.dataAtendimento));
  e.ele("codigoIbgeMunicipio").txt(validateIbge(h.codigoIbgeMunicipio));
}

function appendVisita(parent: XMLBuilder, v: VisitaDomiciliar): void {
  const e = parent.ele("visitasDomiciliares");
  e.ele("uuidFicha").txt(validateUuidLedi(v.uuidFicha));
  if (v.turno != null) e.ele("turno").txt(String(v.turno));
  if (v.numProntuario) e.ele("numProntuario").txt(v.numProntuario);
  if (v.cpfCidadao) e.ele("cpfCidadao").txt(validateCpf(v.cpfCidadao));
  if (!v.cpfCidadao && v.cnsCidadao) e.ele("cnsCidadao").txt(validateCns(v.cnsCidadao));
  if (v.dtNascimento != null) e.ele("dtNascimento").txt(String(v.dtNascimento));
  if (v.sexo != null) e.ele("sexo").txt(String(v.sexo));
  e.ele("statusVisitaCompartilhadaOutroProfissional")
    .txt(v.statusVisitaCompartilhadaOutroProfissional ? "true" : "false");
  for (const m of v.motivosVisita) e.ele("motivosVisita").txt(String(m));
  if (v.desfecho != null) e.ele("desfecho").txt(String(v.desfecho));
  if (v.microArea) e.ele("microArea").txt(v.microArea);
  e.ele("stForaArea").txt(v.stForaArea ? "true" : "false");
  if (v.tipoDeImovel != null) e.ele("tipoDeImovel").txt(String(v.tipoDeImovel));
}

function appendFichaFvd(parent: XMLBuilder, f: FichaVisitaDomiciliarMaster): void {
  const e = parent.ele("ns4:fichaVisitaDomiciliarMasterTransport");
  e.ele("uuidFicha").txt(validateUuidLedi(f.uuidFicha));
  e.ele("tpCdsOrigem").txt(String(f.tpCdsOrigem));
  appendHeader(e, f.headerTransport);
  for (const v of f.visitasDomiciliares) appendVisita(e, v);
}

function appendInstalacao(parent: XMLBuilder, qname: string, d: DadoInstalacao): void {
  const e = parent.ele(qname);
  e.ele("contraChave").txt(d.contraChave);
  e.ele("uuidInstalacao").txt(d.uuidInstalacao);
  e.ele("cpfOuCnpj").txt(validateCpfOuCnpj(d.cpfOuCnpj));
  e.ele("nomeOuRazaoSocial").txt(d.nomeOuRazaoSocial);
  e.ele("versaoSistema").txt(d.versaoSistema);
}

/** Serializa um DadoTransporte de FVD em string XML. */
export function serializeDadoTransporteFvd(
  dt: DadoTransporte<FichaVisitaDomiciliarMaster>,
): string {
  if (dt.tipoDadoSerializado !== TipoDadoSerializado.VISITA_DOMICILIAR) {
    throw new Error("serializeDadoTransporteFvd recebeu tipoDadoSerializado != 8");
  }
  const ns4 = NS4_BY_TIPO[dt.tipoDadoSerializado];
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
  appendFichaFvd(root, dt.ficha);
  appendInstalacao(root, "ns2:remetente", dt.remetente);
  appendInstalacao(root, "ns2:originadora", dt.originadora);
  const v = root.ele("versao");
  v.att("major", String(dt.versao.major));
  v.att("minor", String(dt.versao.minor));
  v.att("revision", String(dt.versao.revision));
  return doc.end({ prettyPrint: false });
}

export const DEFAULT_VERSAO = VERSAO_LEDI_DEFAULT;

// Referência ao fragment para evitar tree-shake warning quando expandirmos outras fichas.
void fragment;
