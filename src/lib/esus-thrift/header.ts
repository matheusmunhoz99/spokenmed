/**
 * UnicaLotacaoHeader / LotacaoHeader / VariasLotacoesHeader (LEDI 7.4).
 *
 * Spec: https://integracao.esusaps.bridge.ufsc.tech/ledi/documentacao/estrutura_arquivos/header-transport.html
 *
 * Cada ficha LEDI carrega um header que identifica o profissional + lotação.
 * FCD e FCI usam UnicaLotacaoHeader; FAI/FAO usam VariasLotacoesHeader.
 */

import { TBinaryWriter } from "./protocol";

export interface UnicaLotacaoHeaderInput {
  profissionalCNS: string;          // #1 obrigatório, 15
  cboCodigo_2002: string;           // #2 obrigatório
  cnes: string;                     // #3 obrigatório, 7
  ine?: string | null;              // #4 opcional, 10
  dataAtendimentoEpochMs: number;   // #5 obrigatório, ms Epoch
  codigoIbgeMunicipio: string;      // #6 obrigatório, 7
}

/** Escreve o conteúdo de UnicaLotacaoHeader (sem o STOP final). */
export function writeUnicaLotacaoHeader(
  w: TBinaryWriter,
  h: UnicaLotacaoHeaderInput,
): void {
  w.reqString(1, h.profissionalCNS);
  w.reqString(2, h.cboCodigo_2002);
  w.reqString(3, h.cnes);
  w.optString(4, h.ine);
  w.reqI64(5, h.dataAtendimentoEpochMs);
  w.reqString(6, h.codigoIbgeMunicipio);
}

export interface LotacaoHeaderInput {
  profissionalCNS: string;
  cboCodigo_2002: string;
  cnes: string;
  ine?: string | null;
}

export function writeLotacaoHeader(
  w: TBinaryWriter,
  h: LotacaoHeaderInput,
): void {
  w.reqString(1, h.profissionalCNS);
  w.reqString(2, h.cboCodigo_2002);
  w.reqString(3, h.cnes);
  w.optString(4, h.ine);
}

export interface VariasLotacoesHeaderInput {
  lotacaoFormPrincipal: LotacaoHeaderInput;                      // #1 obrigatório
  lotacaoFormAtendimentoCompartilhado?: LotacaoHeaderInput | null; // #2 opcional
  dataAtendimentoEpochMs: number;                                // #3 obrigatório
  codigoIbgeMunicipio: string;                                   // #4 obrigatório
}

export function writeVariasLotacoesHeader(
  w: TBinaryWriter,
  h: VariasLotacoesHeaderInput,
): void {
  w.reqStruct(1, (sw) => writeLotacaoHeader(sw, h.lotacaoFormPrincipal));
  if (h.lotacaoFormAtendimentoCompartilhado) {
    w.reqStruct(2, (sw) =>
      writeLotacaoHeader(sw, h.lotacaoFormAtendimentoCompartilhado!),
    );
  }
  w.reqI64(3, h.dataAtendimentoEpochMs);
  w.reqString(4, h.codigoIbgeMunicipio);
}
