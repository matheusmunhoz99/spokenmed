/**
 * Builder Thrift binário — Ficha de Cadastro Individual (FCI), LEDI 7.4.
 *
 * Struct raiz: CadastroIndividualThrift
 * Spec pública: https://integracao.esusaps.bridge.ufsc.tech/ledi/documentacao/cadastros/individual/
 *
 * NOTA: os field-IDs aqui seguem a IDL pública 7.4 documentada. Caso o PEC
 * de destino use uma minor diferente, os IDs podem precisar de ajuste.
 */
import { TBinaryWriter, buildStruct } from "../protocol";
import { writeUnicaLotacaoHeader, type UnicaLotacaoHeaderInput } from "../header";
import { RACA_COR, NACIONALIDADE, ESCOLARIDADE } from "../../esus-codigos";

function digits(v: string | null | undefined): string | null {
  if (!v) return null;
  const c = v.replace(/\D/g, "");
  return c.length ? c : null;
}
function epoch(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isFinite(x.getTime()) ? x.getTime() : null;
}
function mapEnum<T extends Record<string, number | string>>(
  map: T,
  key: string | null | undefined,
): number | undefined {
  if (!key) return undefined;
  const v = (map as any)[key];
  return typeof v === "number" ? v : undefined;
}

// ---------- IdentificacaoUsuarioCidadao ----------
interface IdentInput {
  cnsCidadao?: string | null;
  cpfCidadao?: string | null;
  nomeSocial?: string | null;
  nomeCompleto: string;
  dtNascimento: number; // epoch ms
  sexo: 0 | 1; // 0 = FEMININO, 1 = MASCULINO (LEDI usa enum Sexo)
  racaCor?: number;     // 1..5,99
  etnia?: string | null;
  nomeMae?: string | null;
  semNomeMae: boolean;
  nomePai?: string | null;
  semNomePai: boolean;
  nacionalidade?: number;     // 1 BR, 2 NATURALIZADO, 3 ESTRANGEIRO
  paisNascimento?: number;
  municipioNascimento?: string | null; // 7
  ufNascimento?: number;
  dataNaturalizacao?: number | null;
  portariaNaturalizacao?: string | null;
  dataEntradaBrasil?: number | null;
  telefoneCelular?: string | null;
  email?: string | null;
}

function writeIdentificacao(w: TBinaryWriter, i: IdentInput) {
  w.optString(1, i.cnsCidadao);
  w.optString(2, i.cpfCidadao);
  w.optString(3, i.nomeSocial);
  w.reqString(4, i.nomeCompleto);
  w.reqI64(5, i.dtNascimento);
  w.writeFieldBegin(8 /* I32 */, 6); w.writeI32(i.sexo);
  if (i.racaCor != null) { w.writeFieldBegin(8, 7); w.writeI32(i.racaCor); }
  w.optString(8, i.etnia);
  w.optString(9, i.nomeMae);
  w.reqBool(10, i.semNomeMae);
  w.optString(11, i.nomePai);
  w.reqBool(12, i.semNomePai);
  if (i.nacionalidade != null) { w.writeFieldBegin(8, 13); w.writeI32(i.nacionalidade); }
  if (i.paisNascimento != null) { w.writeFieldBegin(8, 14); w.writeI32(i.paisNascimento); }
  w.optString(15, i.municipioNascimento);
  if (i.ufNascimento != null) { w.writeFieldBegin(8, 16); w.writeI32(i.ufNascimento); }
  w.optI64(17, i.dataNaturalizacao ?? null);
  w.optString(18, i.portariaNaturalizacao);
  w.optI64(19, i.dataEntradaBrasil ?? null);
  w.optString(20, i.telefoneCelular);
  w.optString(21, i.email);
}

// ---------- InformacoesSocioDemograficas ----------
interface SocioInput {
  escolaridade?: number;
  ocupacaoCodigoCbo2002?: string | null;
  situacaoMercadoTrabalho?: number;
  povoComunidadeTradicional?: number;
  orientacaoSexual?: number;
  identidadeGenero?: number;
  relacaoParentescoResponsavel?: number;
  cnsResponsavelFamiliar?: string | null;
}

function writeSocio(w: TBinaryWriter, s: SocioInput) {
  if (s.escolaridade != null) { w.writeFieldBegin(8, 1); w.writeI32(s.escolaridade); }
  w.optString(2, s.ocupacaoCodigoCbo2002);
  if (s.situacaoMercadoTrabalho != null) { w.writeFieldBegin(8, 3); w.writeI32(s.situacaoMercadoTrabalho); }
  if (s.povoComunidadeTradicional != null) { w.writeFieldBegin(8, 4); w.writeI32(s.povoComunidadeTradicional); }
  if (s.orientacaoSexual != null) { w.writeFieldBegin(8, 5); w.writeI32(s.orientacaoSexual); }
  if (s.identidadeGenero != null) { w.writeFieldBegin(8, 6); w.writeI32(s.identidadeGenero); }
  if (s.relacaoParentescoResponsavel != null) { w.writeFieldBegin(8, 7); w.writeI32(s.relacaoParentescoResponsavel); }
  w.optString(8, s.cnsResponsavelFamiliar);
}

// ---------- Root ----------
export interface FciInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  paciente: any; // row pacientes
  recusaCadastro?: boolean;
}

export function buildFCIThrift(input: FciInput): Uint8Array {
  const p = input.paciente;

  const ident: IdentInput = {
    cnsCidadao: digits(p.cns),
    cpfCidadao: digits(p.cpf),
    nomeSocial: p.nome_social || null,
    nomeCompleto: p.nome,
    dtNascimento: epoch(p.data_nascimento) ?? 0,
    sexo: p.sexo === "F" ? 0 : 1,
    racaCor: mapEnum(RACA_COR, p.raca_cor),
    etnia: p.etnia || null,
    nomeMae: p.nome_mae || null,
    semNomeMae: !p.nome_mae,
    nomePai: p.nome_pai || null,
    semNomePai: !p.nome_pai,
    nacionalidade: mapEnum(NACIONALIDADE, p.nacionalidade ?? "brasileira") ?? 1,
    paisNascimento: p.pais_nascimento ?? undefined,
    municipioNascimento: p.municipio_nascimento ?? null,
    ufNascimento: p.uf_nascimento ?? undefined,
    dataNaturalizacao: epoch(p.data_naturalizacao),
    portariaNaturalizacao: p.portaria_naturalizacao || null,
    dataEntradaBrasil: epoch(p.data_entrada_brasil),
    telefoneCelular: digits(p.telefone),
    email: p.email || null,
  };

  const socio: SocioInput = {
    escolaridade: mapEnum(ESCOLARIDADE, p.escolaridade),
    ocupacaoCodigoCbo2002: p.cbo || null,
    situacaoMercadoTrabalho: p.situacao_trabalho ?? undefined,
    povoComunidadeTradicional: p.povo_tradicional ?? undefined,
    orientacaoSexual: p.orientacao_sexual ?? undefined,
    identidadeGenero: p.identidade_genero ?? undefined,
    relacaoParentescoResponsavel: p.parentesco_responsavel ?? undefined,
    cnsResponsavelFamiliar: digits(p.cns_responsavel),
  };

  return buildStruct((w) => {
    // CadastroIndividualThrift
    w.reqString(1, input.uuidFicha);
    w.reqStruct(2, (sw) => writeUnicaLotacaoHeader(sw, input.header));
    // tpCdsOrigem #3 (i32) = 3 (CDS offline)
    w.writeFieldBegin(8, 3); w.writeI32(3);
    w.reqStruct(4, (sw) => writeIdentificacao(sw, ident));
    w.reqBool(5, !!input.recusaCadastro);
    if (!input.recusaCadastro) {
      w.reqStruct(6, (sw) => writeSocio(sw, socio));
      // condicoesSaude (#7), emSituacaoDeRua (#8), saidaCidadaoCadastro (#9) — opcionais
    }
  });
}
