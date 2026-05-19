// API pública do módulo LEDI oficial (e-SUS APS).
// Implementa hoje: Ficha de Visita Domiciliar (FVD, tipoDadoSerializado=8).
// Arquitetura extensível para FAI, FP, FV, FCI, FCD.
import JSZip from "jszip";
import {
  DadoInstalacao, DadoTransporte, FichaVisitaDomiciliarMaster,
  HeaderTransport, TipoDadoSerializado, VERSAO_LEDI_DEFAULT,
  VisitaDomiciliar,
} from "./models";
import { serializeDadoTransporteFvd } from "./serializers";
import { makeLediUuid } from "./uuid";
import { visitaFromDb, type VisitaRowDb } from "./mappers";

export * from "./models";
export { serializeDadoTransporteFvd } from "./serializers";
export { makeLediUuid } from "./uuid";
export { visitaFromDb } from "./mappers";
export type { VisitaRowDb } from "./mappers";

export interface ExportarFvdInput {
  visitas: VisitaRowDb[];
  header: HeaderTransport;
  cnes: string;
  ine?: string;
  codIbge: string;
  numLote: number | bigint;
  remetente: DadoInstalacao;
  originadora?: DadoInstalacao;
}

export interface ExportarFvdOutput {
  zipBytes: Uint8Array;
  arquivos: { name: string; uuidDadoSerializado: string; uuidFicha: string }[];
  totalVisitas: number;
  xml: string;
}

/**
 * Gera ZIP contendo 1 arquivo XML (Master) com N <visitasDomiciliares>.
 * Cada arquivo é nomeado pelo uuidDadoSerializado.
 */
export async function exportarFichaVisitaDomiciliar(
  input: ExportarFvdInput,
): Promise<ExportarFvdOutput> {
  if (!input.visitas.length) {
    throw new Error("Nenhuma visita domiciliar para exportar.");
  }
  const visitas: VisitaDomiciliar[] = input.visitas.map((r) => visitaFromDb(r, input.cnes));

  const uuidMaster = makeLediUuid(input.cnes);
  const uuidDadoSerializado = makeLediUuid(input.cnes);

  const ficha: FichaVisitaDomiciliarMaster = {
    uuidFicha: uuidMaster,
    tpCdsOrigem: 3,
    headerTransport: input.header,
    visitasDomiciliares: visitas,
  };

  const dt: DadoTransporte<FichaVisitaDomiciliarMaster> = {
    uuidDadoSerializado,
    tipoDadoSerializado: TipoDadoSerializado.VISITA_DOMICILIAR,
    codIbge: input.codIbge,
    cnesDadoSerializado: input.cnes,
    ineDadoSerializado: input.ine,
    numLote: input.numLote,
    ficha,
    remetente: input.remetente,
    originadora: input.originadora ?? input.remetente,
    versao: VERSAO_LEDI_DEFAULT,
  };

  const xml = serializeDadoTransporteFvd(dt);

  const zip = new JSZip();
  const filename = `${uuidDadoSerializado}.xml`;
  zip.folder("data")!.file(filename, xml);
  zip.file(
    "LEIA-ME.txt",
    [
      "Exportação e-SUS APS — XML oficial LEDI 6.3.5",
      "Tipo: Ficha de Visita Domiciliar (tipoDadoSerializado=8)",
      "Importar no PEC e-SUS APS off-line via: CDS > Transporte > Importar XML.",
      "",
      `Arquivos: 1`,
      `Visitas: ${visitas.length}`,
    ].join("\n"),
  );
  const zipBytes = await zip.generateAsync({ type: "uint8array" });

  return {
    zipBytes,
    arquivos: [{ name: filename, uuidDadoSerializado, uuidFicha: uuidMaster }],
    totalVisitas: visitas.length,
    xml,
  };
}
