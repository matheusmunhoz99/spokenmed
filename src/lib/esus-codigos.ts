// Códigos oficiais do LEDI 7.4 — e-SUS APS / BRIDGE-UFSC
// Referência: https://integracao.esusaps.bridge.ufsc.tech/ledi/

export const RACA_COR = {
  branca: 1,
  preta: 2,
  parda: 3,
  amarela: 4,
  indigena: 5,
  sem_informacao: 99,
} as const;

export const SEXO = {
  masculino: "M",
  feminino: "F",
} as const;

export const NACIONALIDADE = {
  brasileira: 1,
  naturalizada: 2,
  estrangeira: 3,
} as const;

export const ESCOLARIDADE = {
  creche: 1,
  pre_escola: 2,
  classe_alfabetizacao: 3,
  alfabetizado_sem_escolaridade: 4,
  fundamental_1a4_incompleto: 5,
  fundamental_1a4_completo: 6,
  fundamental_5a8_incompleto: 7,
  fundamental_completo: 8,
  medio_incompleto: 9,
  medio_completo: 10,
  superior_incompleto: 11,
  superior_completo: 12,
  especializacao_incompleto: 13,
  especializacao_completo: 14,
  mestrado_incompleto: 15,
  mestrado_completo: 16,
  doutorado_incompleto: 17,
  doutorado_completo: 18,
  nao_alfabetizado: 19,
} as const;

export const SITUACAO_MERCADO_TRABALHO = {
  empregador: 1,
  assalariado_carteira: 2,
  assalariado_sem_carteira: 3,
  autonomo_com_previdencia: 4,
  autonomo_sem_previdencia: 5,
  servidor_publico: 6,
  empregado_temporario: 7,
  aposentado_pensionista: 8,
  desempregado: 9,
  nao_trabalha: 10,
  outro: 11,
} as const;

export const ORIENTACAO_SEXUAL = {
  heterossexual: 1,
  homossexual: 2,
  bissexual: 3,
  outro: 4,
} as const;

export const IDENTIDADE_GENERO = {
  homem_trans: 1,
  mulher_trans: 2,
  travesti: 3,
  outro: 4,
} as const;

// --- FCD: Cadastro Domiciliar ---

export const TIPO_IMOVEL = {
  domicilio: 1,
  comercio: 2,
  terreno_baldio: 3,
  ponto_estrategico: 4,
  em_construcao: 5,
  abrigo: 6,
  instituicao_longa_permanencia: 7,
  unidade_prisional: 8,
  unidade_socioeducativa: 9,
  delegacia: 10,
  estabelecimento_religioso: 11,
  escola: 12,
  creche: 13,
  outros: 14,
} as const;

export const CONDICAO_MORADIA = {
  proprio: 1,
  alugado: 2,
  cedido: 3,
  ocupacao: 4,
  situacao_rua: 5,
  outra: 6,
} as const;

export const LOCALIZACAO = {
  urbana: 1,
  rural: 2,
} as const;

export const MATERIAL_PAREDES = {
  alvenaria_revestida: 1,
  alvenaria_sem_revestir: 2,
  taipa_revestida: 3,
  taipa_sem_revestir: 4,
  madeira_aparelhada: 5,
  material_aproveitado: 6,
  palha: 7,
  outros: 8,
} as const;

export const ABASTECIMENTO_AGUA = {
  rede_encanada: 1,
  poco_nascente_domicilio: 2,
  cisterna: 3,
  carro_pipa: 4,
  outros: 5,
} as const;

export const AGUA_CONSUMO = {
  filtrada: 1,
  fervida: 2,
  clorada: 3,
  mineral: 4,
  sem_tratamento: 5,
} as const;

export const ESGOTO = {
  rede_coletora: 1,
  fossa_septica: 2,
  fossa_rudimentar: 3,
  ceu_aberto: 4,
  outros: 5,
} as const;

export const DESTINO_LIXO = {
  coletado: 1,
  queimado_enterrado: 2,
  ceu_aberto: 3,
  outros: 4,
} as const;

export const ANIMAIS = {
  cachorro: 1,
  gato: 2,
  passaro: 3,
  outros: 4,
} as const;

// --- FAD: Visita Domiciliar ---

export const TURNO = {
  manha: 1,
  tarde: 2,
  noite: 3,
} as const;

export const DESFECHO_VISITA = {
  realizada: 1,
  recusada: 2,
  ausente: 3,
} as const;

export const MOTIVO_VISITA = {
  cadastramento: 1,
  busca_ativa: 2,
  acompanhamento: 3,
  egresso_internacao: 4,
  controle_ambiental: 5,
  convite_atividades: 6,
  orientacao_prevencao: 7,
  outros: 99,
} as const;

// helpers
export function codigoCondicaoMoradia(v?: string | null): number | null {
  if (!v) return null;
  const key = v.toLowerCase() as keyof typeof CONDICAO_MORADIA;
  return CONDICAO_MORADIA[key] ?? null;
}

export function codigoLocalizacao(v?: string | null): number | null {
  if (!v) return null;
  return v === "rural" ? LOCALIZACAO.rural : LOCALIZACAO.urbana;
}

export type LediVersao = "7.3" | "7.4";
export const LEDI_VERSAO_ATUAL: LediVersao = "7.4";
