// Models LEDI oficiais (e-SUS APS) — sem I/O, tipos puros.
// Referência: https://integracao.esusab.ufsc.br/ledi/documentacao/thrift-xsd.html

export interface Versao {
  major: number;
  minor: number;
  revision: number;
}

export const VERSAO_LEDI_DEFAULT: Versao = { major: 6, minor: 3, revision: 5 };

/** DadoInstalacao (remetente / originadora). */
export interface DadoInstalacao {
  contraChave: string;
  uuidInstalacao: string;
  cpfOuCnpj: string;
  nomeOuRazaoSocial: string;
  versaoSistema: string;
}

export enum TipoDadoSerializado {
  CADASTRO_INDIVIDUAL = 1,
  CADASTRO_DOMICILIAR = 2,
  ATENDIMENTO_INDIVIDUAL = 4,
  ATENDIMENTO_ODONTOLOGICO = 5,
  PROCEDIMENTOS = 7,
  VISITA_DOMICILIAR = 8,
  VACINACAO = 14,
}

/** Namespace ns4 por tipo de ficha (URI oficial UFSC). */
export const NS4_BY_TIPO: Record<TipoDadoSerializado, string> = {
  [TipoDadoSerializado.CADASTRO_INDIVIDUAL]: "http://esus.ufsc.br/fichacadastroindividualmaster",
  [TipoDadoSerializado.CADASTRO_DOMICILIAR]: "http://esus.ufsc.br/fichacadastrodomiciliarmaster",
  [TipoDadoSerializado.ATENDIMENTO_INDIVIDUAL]: "http://esus.ufsc.br/fichaatendimentoindividualmaster",
  [TipoDadoSerializado.ATENDIMENTO_ODONTOLOGICO]: "http://esus.ufsc.br/fichaatendimentoodontologicomaster",
  [TipoDadoSerializado.PROCEDIMENTOS]: "http://esus.ufsc.br/fichaprocedimentomaster",
  [TipoDadoSerializado.VISITA_DOMICILIAR]: "http://esus.ufsc.br/fichavisitadomiciliarmaster",
  [TipoDadoSerializado.VACINACAO]: "http://esus.ufsc.br/fichavacinacaomaster",
};

export interface HeaderTransport {
  profissionalCNS: string;
  cboCodigo_2002: string;
  cnes: string;
  ine?: string;
  /** Unix epoch em milissegundos (UTC). */
  dataAtendimento: number;
  codigoIbgeMunicipio: string;
}

/** Turno: 1=manhã, 2=tarde, 3=noite. */
export type Turno = 1 | 2 | 3;
/** Sexo: 0=feminino, 1=masculino. */
export type Sexo = 0 | 1;
/** Desfecho: 1=visita realizada, 2=visita recusada, 3=ausente. */
export type DesfechoVisita = 1 | 2 | 3;

/**
 * Códigos LEDI de motivo de visita.
 * Subset relevante; outros códigos passam livres pois o tipo é `number`.
 */
export const MotivoVisita = {
  CADASTRAMENTO_ATUALIZACAO: 1,
  VISITA_PERIODICA: 2,
  EGRESSO_INTERNACAO: 3,
  BUSCA_ATIVA: 4,
  ACOMPANHAMENTO: 5,
} as const;

export interface VisitaDomiciliar {
  uuidFicha: string;
  turno?: Turno;
  cpfCidadao?: string;
  cnsCidadao?: string;
  /** Unix epoch em milissegundos (UTC). */
  dtNascimento?: number;
  sexo?: Sexo;
  statusVisitaCompartilhadaOutroProfissional: boolean;
  motivosVisita: number[];
  desfecho?: DesfechoVisita;
  microArea?: string;
  stForaArea: boolean;
  tipoDeImovel?: number;
  numProntuario?: string;
}

export interface FichaVisitaDomiciliarMaster {
  uuidFicha: string;
  /** Origem 3 = CDS off-line. */
  tpCdsOrigem: 3;
  headerTransport: HeaderTransport;
  visitasDomiciliares: VisitaDomiciliar[];
}

export interface DadoTransporte<TFicha = FichaVisitaDomiciliarMaster> {
  uuidDadoSerializado: string;
  tipoDadoSerializado: TipoDadoSerializado;
  codIbge: string;
  cnesDadoSerializado: string;
  ineDadoSerializado?: string;
  numLote: number | bigint;
  ficha: TFicha;
  remetente: DadoInstalacao;
  originadora: DadoInstalacao;
  versao: Versao;
}
