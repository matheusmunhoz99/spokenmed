/**
 * Builders LEDI 7.4 — esqueleto honesto.
 *
 * STATUS: skeleton. Estrutura Master + headerTransport + tpCdsOrigem + list<Child>
 * está correta. Os children contêm os campos OBRIGATÓRIOS mínimos do LEDI 7.4
 * marcados como REQUIRED, mais os opcionais mais comuns. Campos opcionais
 * raros e structs aninhadas estão marcadas com TODO.
 *
 * Para passar 100% na validação do importador PEC homologação ainda falta:
 *   1. Cobrir todos os TODO marcados em cada writeChild()
 *   2. Validar field IDs contra o .thrift oficial (ledi-thrift-models repo MS)
 *   3. Testar round-trip com .esus de exemplo aceito
 *
 * Doc raiz: https://integracao.esusaps.bridge.ufsc.tech/ledi/documentacao/
 */
import { TBinaryWriter, buildStruct } from "../protocol";
import {
  writeUnicaLotacaoHeader,
  writeVariasLotacoesHeader,
  type UnicaLotacaoHeaderInput,
  type VariasLotacoesHeaderInput,
} from "../header";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function epoch(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isFinite(x.getTime()) ? x.getTime() : null;
}
function digits(v: string | null | undefined): string | null {
  if (!v) return null;
  const c = v.replace(/\D/g, "");
  return c.length ? c : null;
}

interface MasterInput<H> {
  uuidFicha: string;
  header: H;
  rows: any[];
  tpCdsOrigem?: number; // 3 = CDS offline (default)
}

function buildMasterVarias(
  m: MasterInput<VariasLotacoesHeaderInput>,
  writeChild: (w: TBinaryWriter, row: any) => void,
): Uint8Array {
  return buildStruct((w) => {
    w.reqString(1, m.uuidFicha);
    w.reqStruct(2, (sw) => writeVariasLotacoesHeader(sw, m.header));
    w.writeFieldBegin(8, 3); w.writeI32(m.tpCdsOrigem ?? 3);
    w.optListStruct(4, m.rows, writeChild);
  });
}
function buildMasterUnica(
  m: MasterInput<UnicaLotacaoHeaderInput>,
  writeChild: (w: TBinaryWriter, row: any) => void,
): Uint8Array {
  return buildStruct((w) => {
    w.reqString(1, m.uuidFicha);
    w.reqStruct(2, (sw) => writeUnicaLotacaoHeader(sw, m.header));
    w.writeFieldBegin(8, 3); w.writeI32(m.tpCdsOrigem ?? 3);
    w.optListStruct(4, m.rows, writeChild);
  });
}

// ====================================================================
// FAC — Ficha de Atividade Coletiva
// Doc: /ledi/documentacao/atividade_coletiva/
// Master: VariasLotacoesHeader (vários profissionais por atividade)
// ====================================================================
export interface FacInput {
  uuidFicha: string;
  header: VariasLotacoesHeaderInput;
  atividades: any[];
}
export function buildFACThrift(i: FacInput): Uint8Array {
  return buildMasterVarias(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.atividades },
    (w, a) => {
      // REQUIRED
      w.reqString(1, a.uuidFichaOrigem ?? uuid());
      w.reqI64(2, epoch(a.dataAtividade) ?? 0);
      w.writeFieldBegin(8, 3); w.writeI32(a.turno ?? 3); // 1m 2t 3n
      w.writeFieldBegin(8, 4); w.writeI32(a.tipoAtividade ?? 1);
      w.reqString(5, a.cnesLocal ?? i.header.cnes ?? "");
      // OPCIONAIS comuns
      w.optBool(6, a.programaSaudeNaEscola);
      w.optListI64(7, a.publicoAlvo);
      w.optListI64(8, a.temasParaReuniao);
      w.optListI64(9, a.temasParaSaude);
      w.optListI64(10, a.praticasEmSaude);
      w.optI64(11, a.numeroParticipantes);
      w.optI64(12, a.numeroAvaliacoesAlteradas);
      // TODO LEDI: list<ParticipanteAtividadeColetiva> participantes (struct aninhada)
      //   - cnsParticipante, dataNascimento, sexo, peso, altura, cidsCiaps,
      //     praticasCorporais, avaliacaoSaudeBucal, etc.
      // TODO LEDI: list<string> profissionaisAtividadeColetiva (CNS adicionais)
      // TODO LEDI: optString instituicaoEnsino (INEP) quando PSE = true
    },
  );
}

// ====================================================================
// FP — Ficha de Procedimentos
// Doc: /ledi/documentacao/procedimentos/
// Master: VariasLotacoesHeader
// ====================================================================
export interface FpInput {
  uuidFicha: string;
  header: VariasLotacoesHeaderInput;
  procedimentos: any[];
}
export function buildFPThrift(i: FpInput): Uint8Array {
  return buildMasterVarias(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.procedimentos },
    (w, p) => {
      // REQUIRED
      w.reqString(1, p.uuidFichaOrigem ?? uuid());
      w.reqI64(2, epoch(p.dataAtendimento) ?? 0);
      w.writeFieldBegin(8, 3); w.writeI32(p.turno ?? 3);
      // OPCIONAIS cidadão (FP suporta atendimento sem identificação)
      w.optString(4, digits(p.cnsCidadao));
      w.optString(5, digits(p.cpfCidadao));
      w.optI64(6, epoch(p.dtNascimento));
      if (p.sexo != null) { w.writeFieldBegin(8, 7); w.writeI32(p.sexo); }
      w.optString(8, p.numeroProntuario);
      if (p.localAtendimento != null) { w.writeFieldBegin(8, 9); w.writeI32(p.localAtendimento); }
      // Listas de procedimentos
      w.optListString(10, p.procedimentosSigtap); // i64 códigos SIGTAP -> string no LEDI 7.4
      w.optListString(11, p.cids10);
      // TODO LEDI: list<string> aleitamento (i32), list i32 escutaInicial, etc.
      // TODO LEDI: optBool atendimentoCompartilhadoLotacao (NASF)
    },
  );
}

// ====================================================================
// FVD — Ficha de Visita Domiciliar e Territorial (ACS)
// Doc: /ledi/documentacao/visita_domiciliar/
// Master: UnicaLotacaoHeader (1 ACS por ficha)
// ====================================================================
export interface FvdInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  visitas: any[];
}
export function buildFVDThrift(i: FvdInput): Uint8Array {
  return buildMasterUnica(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.visitas },
    (w, v) => {
      // REQUIRED
      w.reqString(1, v.uuidFichaOrigem ?? uuid());
      w.reqI64(2, epoch(v.dataVisita) ?? 0);
      w.writeFieldBegin(8, 3); w.writeI32(v.turno ?? 3);
      // Identificação cidadão (1 dos dois é obrigatório, validação no PEC)
      w.optString(4, digits(v.cnsCidadao));
      w.optString(5, digits(v.cpfCidadao));
      w.optI64(6, epoch(v.dtNascimento));
      if (v.sexo != null) { w.writeFieldBegin(8, 7); w.writeI32(v.sexo); }
      w.optString(8, v.numeroProntuario);
      w.optString(9, v.microarea);
      w.optBool(10, v.foraArea);
      // Motivos / acompanhamento / busca ativa / controle ambiental
      w.optListI64(11, v.motivosVisita);
      w.optListI64(12, v.acompanhamento);
      w.optListI64(13, v.buscaAtiva);
      w.optListI64(14, v.controleAmbiental);
      // Desfecho da visita (1 realizada / 2 recusada / 3 ausente)
      if (v.desfecho != null) { w.writeFieldBegin(8, 15); w.writeI32(v.desfecho); }
      // TODO LEDI: medidas antropométricas (peso, altura, perímetro cefálico)
      // TODO LEDI: optBool antiRabicaHumana, optI64 numProntuarioFamilia
    },
  );
}

// ====================================================================
// FMCA — Marcadores de Consumo Alimentar
// Doc: /ledi/documentacao/marcadores_consumo_alimentar/
// Master: UnicaLotacaoHeader
// IMPORTANTE: as perguntas variam por faixa etária (< 6m, 6-23m, ≥ 2 anos).
// O LEDI usa 3 listas separadas de respostas. Aqui consolidamos em "respostas".
// ====================================================================
export interface FmcaInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  marcadores: any[];
}
export function buildFMCAThrift(i: FmcaInput): Uint8Array {
  return buildMasterUnica(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.marcadores },
    (w, m) => {
      // REQUIRED
      w.reqString(1, m.uuidFichaOrigem ?? uuid());
      w.reqI64(2, epoch(m.dataAtendimento) ?? 0);
      w.writeFieldBegin(8, 3); w.writeI32(m.turno ?? 3);
      // Cidadão
      w.optString(4, digits(m.cnsCidadao));
      w.optString(5, digits(m.cpfCidadao));
      w.reqI64(6, epoch(m.dtNascimento) ?? 0);
      w.writeFieldBegin(8, 7); w.writeI32(m.sexo ?? 0);
      w.optString(8, m.numeroProntuario);
      if (m.localAtendimento != null) { w.writeFieldBegin(8, 9); w.writeI32(m.localAtendimento); }
      // Respostas (faixa etária determinada pelo importador via dtNascimento)
      w.optListI64(10, m.respostasMenor6Meses);
      w.optListI64(11, m.respostas6a23Meses);
      w.optListI64(12, m.respostas2AnosOuMais);
      // TODO LEDI: validações cruzadas faixa etária × lista preenchida
    },
  );
}

// ====================================================================
// FAE — Ficha de Atendimento Especializado (NASF / CEO / Polo Acad. Saúde)
// Doc: /ledi/documentacao/atendimento_especializado_individual/ (CEO)
//      /ledi/documentacao/atendimento_individual/ (NASF compartilha tipo)
// Master: VariasLotacoesHeader (pode ter 2 profissionais p/ atend. compartilhado)
// ====================================================================
export interface FaeInput {
  uuidFicha: string;
  header: VariasLotacoesHeaderInput;
  atendimentos: any[];
}
export function buildFAEThrift(i: FaeInput): Uint8Array {
  return buildMasterVarias(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.atendimentos },
    (w, a) => {
      // REQUIRED
      w.reqString(1, a.uuidFichaOrigem ?? uuid());
      w.reqI64(2, epoch(a.dataAtendimento) ?? 0);
      w.writeFieldBegin(8, 3); w.writeI32(a.turno ?? 3);
      // Cidadão
      w.optString(4, digits(a.cnsCidadao));
      w.optString(5, digits(a.cpfCidadao));
      w.reqI64(6, epoch(a.dtNascimento) ?? 0);
      w.writeFieldBegin(8, 7); w.writeI32(a.sexo ?? 0);
      // Atendimento
      if (a.localAtendimento != null) { w.writeFieldBegin(8, 8); w.writeI32(a.localAtendimento); }
      if (a.tipoAtendimento != null) { w.writeFieldBegin(8, 9); w.writeI32(a.tipoAtendimento); }
      if (a.modalidade != null) { w.writeFieldBegin(8, 10); w.writeI32(a.modalidade); } // presencial/tele
      w.optListString(11, a.cids10);
      w.optListString(12, a.ciaps);
      w.optListString(13, a.procedimentosSigtap);
      // Condutas / desfecho / encaminhamentos
      w.optListI64(14, a.condutas);
      w.optListI64(15, a.encaminhamentosInternos);
      w.optListI64(16, a.encaminhamentosExternos);
      w.optBool(17, a.matriciamentoNasf);
      // TODO LEDI: list<MedicamentoPrescritoSadt> medicamentosPrescritos (struct)
      // TODO LEDI: struct AvaliacaoElegibilidadeAdmissao (apenas AD/NASF)
      // TODO LEDI: optI32 racionalidadeEmSaude (PICS)
    },
  );
}

// ====================================================================
// FCZM — Ficha de Avaliação de Elegibilidade e Admissão / Controle Zoonoses
// Doc: /ledi/documentacao/avaliacao_zika_microcefalia/
// (também conhecida como Ficha Zika/Microcefalia em algumas versões)
// Master: UnicaLotacaoHeader
// ====================================================================
export interface FczmInput {
  uuidFicha: string;
  header: UnicaLotacaoHeaderInput;
  avaliacoes: any[];
}
export function buildFCZMThrift(i: FczmInput): Uint8Array {
  return buildMasterUnica(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.avaliacoes },
    (w, a) => {
      // REQUIRED
      w.reqString(1, a.uuidFichaOrigem ?? uuid());
      w.reqI64(2, epoch(a.dataAvaliacao) ?? 0);
      w.writeFieldBegin(8, 3); w.writeI32(a.turno ?? 3);
      // Cidadão (criança avaliada)
      w.optString(4, digits(a.cnsCidadao));
      w.optString(5, digits(a.cpfCidadao));
      w.reqI64(6, epoch(a.dtNascimento) ?? 0);
      w.writeFieldBegin(8, 7); w.writeI32(a.sexo ?? 0);
      // Antropometria
      if (a.perimetroCefalico != null) { w.writeFieldBegin(4, 8); w.writeDouble(Number(a.perimetroCefalico)); }
      if (a.peso != null) { w.writeFieldBegin(4, 9); w.writeDouble(Number(a.peso)); }
      if (a.altura != null) { w.writeFieldBegin(4, 10); w.writeDouble(Number(a.altura)); }
      // Avaliação clínica
      w.optListI64(11, a.atrasoDesenvolvimento);
      w.optListI64(12, a.alteracoesFenotipicas);
      w.optListI64(13, a.encaminhamentos);
      // TODO LEDI: optI32 classificacaoFinal (confirmado/descartado/em investigação)
      // TODO LEDI: optString cnsResponsavelFamiliar
    },
  );
}

// ====================================================================
// FV — Ficha de Vacinação
// Doc: /ledi/documentacao/vacinacao/
// Master: VariasLotacoesHeader
// IMPORTANTE: cada child = 1 cidadão; vacinas aplicadas vão em lista aninhada.
// ====================================================================
export interface FvInput {
  uuidFicha: string;
  header: VariasLotacoesHeaderInput;
  vacinacoes: any[];
}

function writeVacinaAplicada(w: TBinaryWriter, v: any) {
  // struct VacinaAplicada — campos LEDI 7.4
  w.reqString(1, v.codigoImunobiologico ?? "");
  w.reqString(2, v.estrategia ?? "");
  w.reqString(3, v.dose ?? "");
  w.optString(4, v.lote);
  w.optString(5, v.fabricante);
  w.optI64(6, epoch(v.dataAplicacao));
  w.optString(7, v.viaAdministracao);
  // TODO LEDI: localAplicacao, grupoAtendimento
}

export function buildFVThrift(i: FvInput): Uint8Array {
  return buildMasterVarias(
    { uuidFicha: i.uuidFicha, header: i.header, rows: i.vacinacoes },
    (w, v) => {
      // REQUIRED
      w.reqString(1, v.uuidFichaOrigem ?? uuid());
      w.reqI64(2, epoch(v.dataAtendimento ?? v.dataVacinacao) ?? 0);
      w.writeFieldBegin(8, 3); w.writeI32(v.turno ?? 3);
      // Cidadão
      w.optString(4, digits(v.cnsCidadao));
      w.optString(5, digits(v.cpfCidadao));
      w.reqI64(6, epoch(v.dtNascimento) ?? 0);
      w.writeFieldBegin(8, 7); w.writeI32(v.sexo ?? 0);
      if (v.localAtendimento != null) { w.writeFieldBegin(8, 8); w.writeI32(v.localAtendimento); }
      // Condições especiais
      w.optBool(9, v.gestante);
      w.optBool(10, v.viajante);
      w.optBool(11, v.comunicanteHanseniase);
      // Lista de vacinas aplicadas (struct aninhada)
      w.optListStruct(12, Array.isArray(v.vacinasAplicadas) ? v.vacinasAplicadas : [], writeVacinaAplicada);
      // TODO LEDI: list<EventoAdversoVacinacao> eventosAdversos
      // TODO LEDI: optI32 grupoAtendimentoVacinacao
    },
  );
}
