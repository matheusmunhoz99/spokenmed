// Builder FCI — Cadastro Individual.
import { digits, epochMs, tag } from "./escape";
import { montarEnvelope, renderHeaderUnicaLotacao, type HeaderTransport } from "./envelope";

const SEXO_MAP: Record<string, number> = { F: 0, M: 1 };

export interface FciInput {
  header: HeaderTransport;
  cnes: string;
  ine?: string | null;
  codIbge: string;
  numLote: number;
  loteUuid: string;
  paciente: any;
}

export function buildFciXml(input: FciInput): { uuidDadoSerializado: string; xml: string } {
  const p = input.paciente;
  const uuidFicha = `${input.cnes}-${Math.floor(Math.random()*1e10).toString().padStart(10,"0")}-FDCI-0000-0000-${String(input.numLote).padStart(10,"0")}`;
  const dtNasc = epochMs(p.data_nascimento);
  const sexo = SEXO_MAP[p.sexo] ?? null;

  const bloco =
    `<cadastrosIndividuais>` +
    `<identificacaoUsuarioCidadao>` +
    (digits(p.cns) ? tag("cnsCidadao", digits(p.cns)!) : "") +
    (digits(p.cpf) ? tag("cpfCidadao", digits(p.cpf)!) : "") +
    tag("nomeCompleto", p.nome) +
    (p.nome_mae ? tag("nomeMae", p.nome_mae) : tag("statusEhDesconhecidoNomeMae", "true")) +
    (dtNasc != null ? tag("dtNascimento", dtNasc) : "") +
    (sexo != null ? tag("sexo", sexo) : "") +
    tag("nacionalidadeCidadao", 1) +
    `</identificacaoUsuarioCidadao>` +
    `</cadastrosIndividuais>`;

  const conteudo =
    tag("uuidFicha", uuidFicha) +
    tag("tpCdsOrigem", 3) +
    renderHeaderUnicaLotacao(input.header) +
    bloco;

  return {
    uuidDadoSerializado: uuidFicha,
    xml: montarEnvelope({
      tipo: "FCI",
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
