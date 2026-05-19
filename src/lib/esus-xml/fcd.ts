// Builder FCD — Cadastro Domiciliar (versão mínima válida).
import { tag } from "./escape";
import { montarEnvelope, renderHeaderUnicaLotacao, type HeaderTransport } from "./envelope";

export interface FcdInput {
  header: HeaderTransport;
  cnes: string;
  ine?: string | null;
  codIbge: string;
  numLote: number;
  loteUuid: string;
  domicilio: any;
}

export function buildFcdXml(input: FcdInput): { uuidDadoSerializado: string; xml: string } {
  const d = input.domicilio;
  const uuidFicha = `${input.cnes}-${Math.floor(Math.random()*1e10).toString().padStart(10,"0")}-FDCD-0000-0000-${String(input.numLote).padStart(10,"0")}`;

  const endereco =
    `<enderecoLocalPermanencia>` +
    tag("bairro", d.bairro) +
    (d.cep ? tag("cep", d.cep.replace(/\D/g, "")) : "") +
    tag("logradouro", d.logradouro) +
    (d.numero ? tag("numero", d.numero) : "") +
    tag("stSemNumero", d.sem_numero ? "true" : "false") +
    tag("tipoLogradouroNumeroDne", 81) +
    tag("municipio", input.codIbge) +
    (d.uf ? tag("uf", d.uf) : "") +
    `</enderecoLocalPermanencia>`;

  const bloco =
    `<cadastrosDomiciliares>` +
    endereco +
    tag("stStatusTermoRecusaCadastroDomiciliarAtencaoBasica", d.termo_recusa ? "true" : "false") +
    `</cadastrosDomiciliares>`;

  const conteudo =
    tag("uuidFicha", uuidFicha) +
    tag("tpCdsOrigem", 3) +
    renderHeaderUnicaLotacao(input.header) +
    bloco;

  return {
    uuidDadoSerializado: uuidFicha,
    xml: montarEnvelope({
      tipo: "FCD",
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
