/**
 * Builder Thrift binário — Ficha de Cadastro Domiciliar (FCD), LEDI 7.4.
 *
 * Struct raiz: CadastroDomiciliarThrift
 * Spec pública: https://integracao.esusaps.bridge.ufsc.tech/ledi/documentacao/cadastros/domiciliar/
 */
import { TBinaryWriter, buildStruct } from "../protocol";
import { writeUnicaLotacaoHeader, type UnicaLotacaoHeaderInput } from "../header";
import { TIPO_IMOVEL, CONDICAO_MORADIA, LOCALIZACAO } from "../../esus-codigos";

function digits(v: string | null | undefined): string | null {
  if (!v) return null;
  const c = v.replace(/\D/g, "");
  return c.length ? c : null;
}
function epoch(d: string | Date | null | undefined): number {
  if (!d) return 0;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isFinite(x.getTime()) ? x.getTime() : 0;
}
function mapEnum<T extends Record<string, number | string>>(
  map: T, key: string | null | undefined,
): number | undefined {
  if (!key) return undefined;
  const v = (map as any)[key];
  return typeof v === "number" ? v : undefined;
}

interface EnderecoInput {
  bairro: string;
  cep: string;
  complemento?: string | null;
  logradouro: string;
  nomeLocalidade?: string | null;
  numero?: string | null;
  pontoReferencia?: string | null;
  semNumero: boolean;
  stForaArea: boolean;
  tipoLogradouroNumeroDne: number;
  municipio: string;  // 7
  uf: string;
  telefoneContato?: string | null;
  telefoneResidencia?: string | null;
}

function writeEndereco(w: TBinaryWriter, e: EnderecoInput) {
  w.reqString(1, e.bairro);
  w.reqString(2, e.cep);
  w.optString(3, e.complemento);
  w.reqString(4, e.logradouro);
  w.optString(5, e.nomeLocalidade);
  w.optString(6, e.numero);
  w.optString(7, e.pontoReferencia);
  w.reqBool(8, e.semNumero);
  w.reqBool(9, e.stForaArea);
  w.writeFieldBegin(8 /* I32 */, 10); w.writeI32(e.tipoLogradouroNumeroDne);
  w.reqString(11, e.municipio);
  w.reqString(12, e.uf);
  w.optString(13, e.telefoneContato);
  w.optString(14, e.telefoneResidencia);
}

interface CondMoradiaInput {
  tipoDeImovel?: number;
  numeroMoradores?: number;
  numeroComodos?: number;
  tipoDeAcessoDomicilio?: number;
  tipoAbastecimentoAgua?: number;
  tipoTratamentoAgua?: number;
  tipoEscoamentoSanitario?: number;
  tipoDestinoLixo?: number;
  tipoMaterialParede?: number;
  stDisponibilidadeEnergiaEletrica?: boolean;
}

function writeCondMoradia(w: TBinaryWriter, c: CondMoradiaInput) {
  if (c.tipoDeImovel != null) { w.writeFieldBegin(8, 1); w.writeI32(c.tipoDeImovel); }
  if (c.numeroMoradores != null) { w.writeFieldBegin(8, 2); w.writeI32(c.numeroMoradores); }
  if (c.numeroComodos != null) { w.writeFieldBegin(8, 3); w.writeI32(c.numeroComodos); }
  if (c.tipoDeAcessoDomicilio != null) { w.writeFieldBegin(8, 4); w.writeI32(c.tipoDeAcessoDomicilio); }
  if (c.tipoAbastecimentoAgua != null) { w.writeFieldBegin(8, 5); w.writeI32(c.tipoAbastecimentoAgua); }
  if (c.tipoTratamentoAgua != null) { w.writeFieldBegin(8, 6); w.writeI32(c.tipoTratamentoAgua); }
  if (c.tipoEscoamentoSanitario != null) { w.writeFieldBegin(8, 7); w.writeI32(c.tipoEscoamentoSanitario); }
  if (c.tipoDestinoLixo != null) { w.writeFieldBegin(8, 8); w.writeI32(c.tipoDestinoLixo); }
  if (c.tipoMaterialParede != null) { w.writeFieldBegin(8, 9); w.writeI32(c.tipoMaterialParede); }
  w.optBool(10, c.stDisponibilidadeEnergiaEletrica);
}

interface MembroInput {
  cpf?: string | null;
  cns?: string | null;
  nomeCompleto: string;
  dataNascimento: number;
  relacaoParentesco?: number;
}

function writeMembro(w: TBinaryWriter, m: MembroInput) {
  w.optString(1, m.cpf);
  w.optString(2, m.cns);
  w.reqString(3, m.nomeCompleto);
  w.reqI64(4, m.dataNascimento);
  if (m.relacaoParentesco != null) { w.writeFieldBegin(8, 5); w.writeI32(m.relacaoParentesco); }
}

interface FamiliaInput {
  uuidFicha: string;
  numeroProntuarioFamiliar?: string | null;
  rendaFamiliar?: number;
  resideDesde?: number | null;
  mudouSe: boolean;
  responsavel?: MembroInput | null;
  membros: MembroInput[];
}

function writeFamilia(w: TBinaryWriter, f: FamiliaInput) {
  w.reqString(1, f.uuidFicha);
  w.optString(2, f.numeroProntuarioFamiliar);
  if (f.rendaFamiliar != null) { w.writeFieldBegin(8, 3); w.writeI32(f.rendaFamiliar); }
  w.optI64(4, f.resideDesde ?? null);
  w.reqBool(5, f.mudouSe);
  if (f.responsavel) w.reqStruct(6, (sw) => writeMembro(sw, f.responsavel!));
  w.optListStruct(7, f.membros, (sw, m) => writeMembro(sw, m));
}

export interface FcdInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  domicilio: any; // row + relacionamentos
  ibgeMunicipio: string;
  uf: string;
  recusaCadastro?: boolean;
}

export function buildFCDThrift(input: FcdInput): Uint8Array {
  const d = input.domicilio;
  const endereco: EnderecoInput = {
    bairro: d.bairro ?? "",
    cep: digits(d.cep) ?? "",
    complemento: d.complemento || null,
    logradouro: d.logradouro ?? "",
    nomeLocalidade: d.localidade || null,
    numero: d.numero || null,
    pontoReferencia: d.referencia || null,
    semNumero: !!d.sem_numero,
    stForaArea: !!d.fora_area,
    tipoLogradouroNumeroDne: 81, // 81 = RUA (default)
    municipio: input.ibgeMunicipio,
    uf: input.uf,
    telefoneContato: digits(d.telefone_contato),
    telefoneResidencia: digits(d.telefone_residencia),
  };

  const cond: CondMoradiaInput = {
    tipoDeImovel: mapEnum(TIPO_IMOVEL, d.tipo_imovel),
    numeroMoradores: d.numero_moradores ?? undefined,
    numeroComodos: d.numero_comodos ?? undefined,
    tipoDeAcessoDomicilio: mapEnum(CONDICAO_MORADIA, d.tipo_acesso),
    stDisponibilidadeEnergiaEletrica: d.energia_eletrica ?? undefined,
  };
  const stLoc = mapEnum(LOCALIZACAO, d.localizacao);

  const familias: FamiliaInput[] = (d.familias ?? []).map((f: any) => ({
    uuidFicha: f.uuid_ficha ?? input.uuidFicha,
    numeroProntuarioFamiliar: f.numero_prontuario || null,
    rendaFamiliar: f.renda_familiar ?? undefined,
    resideDesde: epoch(f.reside_desde) || null,
    mudouSe: !!f.mudou_se,
    responsavel: f.responsavel
      ? {
          cpf: digits(f.responsavel.cpf),
          cns: digits(f.responsavel.cns),
          nomeCompleto: f.responsavel.nome,
          dataNascimento: epoch(f.responsavel.data_nascimento),
        }
      : null,
    membros: (f.familia_membros ?? f.membros ?? []).map((m: any) => ({
      cpf: digits(m.cpf),
      cns: digits(m.cns),
      nomeCompleto: m.nome,
      dataNascimento: epoch(m.data_nascimento),
      relacaoParentesco: m.parentesco ?? undefined,
    })),
  }));

  return buildStruct((w) => {
    w.reqString(1, input.uuidFicha);
    w.reqStruct(2, (sw) => writeUnicaLotacaoHeader(sw, input.header));
    w.writeFieldBegin(8, 3); w.writeI32(3); // tpCdsOrigem = CDS offline
    w.reqStruct(4, (sw) => writeEndereco(sw, endereco));
    w.reqBool(5, !!input.recusaCadastro);
    if (!input.recusaCadastro) {
      w.reqStruct(6, (sw) => writeCondMoradia(sw, cond));
      if (stLoc != null) { w.writeFieldBegin(8, 7); w.writeI32(stLoc); }
      w.optListStruct(8, familias, (sw, f) => writeFamilia(sw, f));
    }
  });
}
