// Opções fielmente baseadas na Ficha de Visita Domiciliar/Territorial do PEC e-SUS CDS.

export const MOTIVOS_VISITA = [
  { value: "cadastro_atualizacao", label: "Cadastramento / atualização" },
  { value: "visita_periodica", label: "Visita periódica" },
  { value: "busca_ativa_consulta", label: "Busca ativa - consulta" },
  { value: "busca_ativa_exame", label: "Busca ativa - exame" },
  { value: "busca_ativa_vacina", label: "Busca ativa - vacina" },
  { value: "busca_ativa_condicionalidade", label: "Busca ativa - condicionalidade (Bolsa Família)" },
  { value: "acomp_gestante", label: "Acompanhamento - gestante" },
  { value: "acomp_puerpera", label: "Acompanhamento - puérpera" },
  { value: "acomp_rn", label: "Acompanhamento - recém-nascido" },
  { value: "acomp_crianca", label: "Acompanhamento - criança" },
  { value: "acomp_desnutricao", label: "Acompanhamento - pessoa com desnutrição" },
  { value: "acomp_reabilitacao", label: "Acompanhamento - reabilitação/deficiência" },
  { value: "acomp_acamado", label: "Acompanhamento - acamado/domiciliado" },
  { value: "acomp_tabagista", label: "Acompanhamento - tabagista" },
  { value: "acomp_condicoes_cronicas", label: "Acompanhamento - condições crônicas" },
  { value: "acomp_saude_mental", label: "Acompanhamento - saúde mental" },
  { value: "controle_ambiental_vetorial", label: "Controle ambiental / vetorial" },
  { value: "convite_atividades_coletivas", label: "Convite a atividades coletivas / campanha" },
  { value: "orientacao_prevencao", label: "Orientação / prevenção" },
  { value: "outros", label: "Outros" },
] as const;

export const ACOMPANHAMENTOS = [
  { value: "hipertensao", label: "Hipertensão arterial" },
  { value: "diabetes", label: "Diabetes" },
  { value: "gestante", label: "Gestante" },
  { value: "asma", label: "Asma" },
  { value: "dpoc", label: "DPOC" },
  { value: "hanseniase", label: "Hanseníase" },
  { value: "tuberculose", label: "Tuberculose" },
  { value: "acamado", label: "Acamado / domiciliado" },
  { value: "saude_mental", label: "Saúde mental" },
  { value: "alcool_drogas", label: "Usuário de álcool / outras drogas" },
  { value: "obesidade", label: "Obesidade" },
] as const;

export const CONTROLE_AMBIENTAL = [
  { value: "acao_aedes", label: "Ações de combate ao Aedes" },
  { value: "imovel_inspecionado", label: "Imóvel inspecionado" },
  { value: "imovel_tratado", label: "Imóvel tratado" },
  { value: "depositos_eliminados", label: "Depósitos eliminados" },
  { value: "amostra_coletada", label: "Amostra coletada" },
] as const;

export const TURNOS = [
  { value: "manha", label: "Manhã" },
  { value: "tarde", label: "Tarde" },
  { value: "noite", label: "Noite" },
] as const;

export const DESFECHOS = [
  { value: "realizada", label: "Visita realizada" },
  { value: "recusada", label: "Visita recusada" },
  { value: "ausente", label: "Ausente" },
] as const;
