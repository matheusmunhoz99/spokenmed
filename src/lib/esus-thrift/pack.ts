/**
 * Empacotador LEDI 7.4 — produz o .zip aceito pelo PEC (importador offline).
 *
 * Estrutura do .zip:
 *   - data: 1 arquivo binário por DadoTransporte (nome = uuidDadoSerializado)
 *   - manifest.json (informativo, ignorado pelo PEC)
 *
 * Cada DadoTransporte embrulha 1 ficha serializada (FCI, FCD, FAD…).
 */
import JSZip from "jszip";
import {
  buildDadoTransporte,
  TipoDadoSerializado,
  type DadoInstalacaoInput,
  type TipoDadoSerializadoId,
  VERSAO_LEDI_7_4,
} from "./transporte";

export interface FichaSerializada {
  tipo: TipoDadoSerializadoId;
  uuid: string;     // uuidDadoSerializado (recomendado: <cnes>-<uuid-v4>)
  bytes: Uint8Array;
}

export interface PackInput {
  cnes: string;        // 7
  ibge: string;        // 7
  ine?: string | null; // 10
  numLote?: number;
  fichas: FichaSerializada[];
  remetente: DadoInstalacaoInput;
  originadora?: DadoInstalacaoInput; // default = remetente
}

export interface PackResult {
  zipBytes: Uint8Array;
  manifest: {
    ledi_versao: string;
    gerado_em: string;
    cnes: string;
    ibge: string;
    ine: string | null;
    num_lote: number | null;
    fichas: { tipo: string; uuid: string; bytes: number }[];
  };
}

const TIPO_NOME: Record<number, string> = Object.fromEntries(
  Object.entries(TipoDadoSerializado).map(([k, v]) => [v as number, k]),
);

export async function packLDI(input: PackInput): Promise<PackResult> {
  const zip = new JSZip();
  const dataFolder = zip.folder("data")!;
  const manifestFichas: { tipo: string; uuid: string; bytes: number }[] = [];

  for (const f of input.fichas) {
    const dt = buildDadoTransporte({
      uuidDadoSerializado: f.uuid,
      tipoDadoSerializado: f.tipo,
      cnesDadoSerializado: input.cnes,
      codIbge: input.ibge,
      ineDadoSerializado: input.ine ?? null,
      numLote: input.numLote ?? null,
      dadoSerializado: f.bytes,
      remetente: input.remetente,
      originadora: input.originadora ?? input.remetente,
      versao: VERSAO_LEDI_7_4,
    });
    dataFolder.file(f.uuid, dt);
    manifestFichas.push({ tipo: TIPO_NOME[f.tipo] ?? String(f.tipo), uuid: f.uuid, bytes: f.bytes.byteLength });
  }

  const manifest = {
    ledi_versao: "7.4.0",
    gerado_em: new Date().toISOString(),
    cnes: input.cnes,
    ibge: input.ibge,
    ine: input.ine ?? null,
    num_lote: input.numLote ?? null,
    fichas: manifestFichas,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "LEIA-ME.txt",
    "Lote e-SUS APS (LEDI 7.4) — formato Thrift binário.\n" +
      "Cada arquivo em data/ é um DadoTransporte serializado (TBinaryProtocol).\n" +
      "Importe pelo módulo Transporte CDS do e-SUS PEC.\n",
  );

  const zipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { zipBytes, manifest };
}
