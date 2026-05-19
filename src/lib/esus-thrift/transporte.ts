/**
 * Camada de transporte LEDI 7.4: DadoTransporte + DadoInstalacao + Versao.
 *
 * Spec: https://integracao.esusaps.bridge.ufsc.tech/ledi/documentacao/estrutura_arquivos/camada-transporte.html
 *
 * Cada ficha serializada (Buffer Thrift) é embrulhada em um DadoTransporte,
 * que carrega CNES/IBGE/INE de origem, número de lote, identificação da
 * instalação remetente/originadora, e a versão do sistema. O conjunto vai
 * empacotado em um .zip aceito pelo importador offline do PEC.
 */

import { TBinaryWriter, buildStruct } from "./protocol";

/** Tipos serializados conhecidos (ver TipoDadoSerializado no dicionário). */
export const TipoDadoSerializado = {
  CADASTRO_INDIVIDUAL: 1,
  CADASTRO_DOMICILIAR: 2,
  FICHA_ATENDIMENTO_INDIVIDUAL: 3,
  FICHA_ATENDIMENTO_ODONTOLOGICO: 4,
  FICHA_ATIVIDADE_COLETIVA: 5,
  FICHA_PROCEDIMENTOS: 6,
  FICHA_VISITA_DOMICILIAR: 7,
  FICHA_MARCADORES_CONSUMO_ALIMENTAR: 8,
  FICHA_AVALIACAO_ELEGIBILIDADE: 9,
  FICHA_ATENDIMENTO_DOMICILIAR: 10,
  FICHA_COMPLEMENTAR_ZIKA_MICROCEFALIA: 11,
  FICHA_VACINACAO: 14,
} as const;

export type TipoDadoSerializadoId =
  typeof TipoDadoSerializado[keyof typeof TipoDadoSerializado];

/** Versao { #1 major, #2 minor, #3 revision }. */
export interface VersaoInput {
  major: number;
  minor: number;
  revision: number;
}

export const VERSAO_LEDI_7_4: VersaoInput = { major: 7, minor: 4, revision: 0 };

export function writeVersao(w: TBinaryWriter, v: VersaoInput): void {
  w.writeFieldBegin(8, 1);
  w.writeI32(v.major);
  w.writeFieldBegin(8, 2);
  w.writeI32(v.minor);
  w.writeFieldBegin(8, 3);
  w.writeI32(v.revision);
}

/** DadoInstalacao — identifica o software que gerou o dado. */
export interface DadoInstalacaoInput {
  contraChave: string;        // #1 obrigatório: "Nome do software - vX.Y"
  uuidInstalacao: string;     // #2 obrigatório
  cpfOuCnpj: string;          // #3 obrigatório (11..15)
  nomeOuRazaoSocial: string;  // #4 obrigatório
  fone?: string | null;       // #5 opcional (10..11)
  email?: string | null;      // #6 opcional (6..255)
}

export function writeDadoInstalacao(
  w: TBinaryWriter,
  d: DadoInstalacaoInput,
): void {
  w.reqString(1, d.contraChave);
  w.reqString(2, d.uuidInstalacao);
  w.reqString(3, d.cpfOuCnpj);
  w.reqString(4, d.nomeOuRazaoSocial);
  w.optString(5, d.fone);
  w.optString(6, d.email);
}

/** DadoTransporte — embrulha cada ficha serializada. */
export interface DadoTransporteInput {
  uuidDadoSerializado: string;        // #1 obrigatório (36..44)
  tipoDadoSerializado: TipoDadoSerializadoId; // #2 obrigatório
  cnesDadoSerializado: string;        // #3 obrigatório, 7
  codIbge: string;                    // #4 obrigatório, 7
  ineDadoSerializado?: string | null; // #5 opcional, 10
  numLote?: number | bigint | null;   // #6 opcional
  dadoSerializado: Uint8Array;        // #7 obrigatório (bytes Thrift da ficha)
  remetente: DadoInstalacaoInput;     // #8 obrigatório
  originadora: DadoInstalacaoInput;   // #9 obrigatório
  versao?: VersaoInput;               // #10 obrigatório (default 7.4.0)
}

/** Serializa um DadoTransporte completo (struct top-level + STOP). */
export function buildDadoTransporte(input: DadoTransporteInput): Uint8Array {
  return buildStruct((w) => {
    w.reqString(1, input.uuidDadoSerializado);
    w.reqI64(2, input.tipoDadoSerializado);
    w.reqString(3, input.cnesDadoSerializado);
    w.reqString(4, input.codIbge);
    w.optString(5, input.ineDadoSerializado);
    w.optI64(6, input.numLote);
    w.reqBinary(7, input.dadoSerializado);
    w.reqStruct(8, (sw) => writeDadoInstalacao(sw, input.remetente));
    w.reqStruct(9, (sw) => writeDadoInstalacao(sw, input.originadora));
    w.reqStruct(10, (sw) => writeVersao(sw, input.versao ?? VERSAO_LEDI_7_4));
  });
}

/**
 * Gera o UUID-com-CNES-na-frente recomendado pela LEDI:
 * `<cnes>-<uuid-v4>` → 7 + 1 + 36 = 44 bytes.
 */
export function uuidComCnes(cnes: string, uuid: string): string {
  return `${cnes}-${uuid}`;
}
