// Gerador de payloads no formato LEDI 7.4 (JSON) — e-SUS APS / Bridge UFSC
// Esses payloads espelham os DTOs públicos da PEC e podem ser usados via API
// LEDI/Bridge. A versão Thrift binária (.zip CDS offline) será gerada a partir
// destes mesmos objetos usando os IDLs da PEC numa segunda etapa.
import { RACA_COR, NACIONALIDADE, ESCOLARIDADE, TIPO_IMOVEL, CONDICAO_MORADIA, LOCALIZACAO_DOMICILIO } from "./esus-codigos";

export type Cabecalho = {
  uuidFicha: string;
  cnesUnidade: string;
  ineEquipe?: string | null;
  cnsProfissional: string;
  cboProfissional: string;
  dataAtendimento: number; // epoch millis (LEDI usa Long)
};

function toEpochMillis(d: string | Date | null | undefined): number {
  if (!d) return 0;
  const date = typeof d === "string" ? new Date(d) : d;
  return date.getTime();
}

function digits(v: string | null | undefined): string | null {
  if (!v) return null;
  const c = v.replace(/\D/g, "");
  return c.length ? c : null;
}

function mapEnum<T extends Record<string, number | string>>(map: T, key: string | null | undefined): T[keyof T] | undefined {
  if (!key) return undefined;
  return (map as any)[key];
}

// ---------- FCD: Cadastro Domiciliar e Territorial ----------
export function buildFCD(d: any, cab: Cabecalho) {
  const tipoEnderecoLogradouro = 81; // 81=RUA por padrão. Pode ser sobrescrito.
  return {
    uuidFicha: cab.uuidFicha,
    tpCdsOrigem: 3, // 3 = CDS offline
    cnes: cab.cnesUnidade,
    ine: cab.ineEquipe ?? undefined,
    cnsProfissional: cab.cnsProfissional,
    cboCodigo_2002: cab.cboProfissional,
    dataAtendimento: cab.dataAtendimento,
    enderecoLocalPermanencia: {
      bairro: d.bairro ?? "",
      cep: digits(d.cep) ?? "",
      complemento: d.complemento ?? undefined,
      logradouro: d.logradouro ?? "",
      nomeLocalidade: d.localidade ?? undefined,
      numero: d.numero ?? undefined,
      pontoReferencia: d.referencia ?? undefined,
      semNumero: !!d.sem_numero,
      stForaArea: !!d.fora_area,
      tipoLogradouroNumeroDne: tipoEnderecoLogradouro,
      municipio: d.ibge_municipio ?? undefined, // 7 dígitos IBGE
      uf: d.uf ?? undefined,
    },
    statusTermoRecusaCadastroDomiciliarAtencaoBasica: !!d.recusa_cadastro,
    respostasCondicaoMoradia: d.condicao_moradia
      ? {
          tipoDeImovel: mapEnum(TIPO_IMOVEL, d.tipo_imovel),
          numeroMoradores: d.numero_moradores ?? undefined,
          numeroComodos: d.numero_comodos ?? undefined,
          tipoDeAcessoDomicilio: mapEnum(CONDICAO_MORADIA, d.tipo_acesso) ?? undefined,
          tipoAbastecimentoAgua: d.abastecimento_agua ?? undefined,
          tipoTratamentoAgua: d.tratamento_agua ?? undefined,
          tipoEscoamentoSanitario: d.escoamento_sanitario ?? undefined,
          tipoDestinoLixo: d.destino_lixo ?? undefined,
          tipoMaterialParede: d.material_parede ?? undefined,
          stDisponibilidadeEnergiaEletrica: d.energia_eletrica ?? undefined,
        }
      : undefined,
    stLocalizacao: mapEnum(LOCALIZACAO_DOMICILIO, d.localizacao) ?? undefined,
    familias: (d.familias ?? []).map((f: any) => ({
      uuidFicha: f.uuid_ficha ?? cab.uuidFicha,
      numeroProntuarioFamiliar: f.numero_prontuario ?? undefined,
      rendaFamiliar: f.renda_familiar ?? undefined,
      reside_desde: toEpochMillis(f.reside_desde),
      mudouSe: !!f.mudou_se,
      responsavel: f.responsavel
        ? {
            cpfCidadao: digits(f.responsavel.cpf) ?? undefined,
            cnsCidadao: digits(f.responsavel.cns) ?? undefined,
            dataNascimento: toEpochMillis(f.responsavel.data_nascimento),
            nomeCompleto: f.responsavel.nome,
          }
        : undefined,
      membros: (f.membros ?? []).map((m: any) => ({
        cpf: digits(m.cpf) ?? undefined,
        cns: digits(m.cns) ?? undefined,
        nomeCompleto: m.nome,
        dataNascimento: toEpochMillis(m.data_nascimento),
        relacaoParentesco: m.parentesco ?? undefined,
      })),
    })),
    animaisImovel: (d.animais ?? []).map((a: any) => ({
      tipoAnimal: a.tipo,
      qtdAnimais: a.quantidade ?? 1,
    })),
  };
}

// ---------- FCI: Cadastro Individual ----------
export function buildFCI(p: any, cab: Cabecalho) {
  return {
    uuidFicha: cab.uuidFicha,
    tpCdsOrigem: 3,
    cnes: cab.cnesUnidade,
    ine: cab.ineEquipe ?? undefined,
    cnsProfissional: cab.cnsProfissional,
    cboCodigo_2002: cab.cboProfissional,
    dataAtendimento: cab.dataAtendimento,
    identificacaoUsuarioCidadao: {
      cnsCidadao: digits(p.cns) ?? undefined,
      cpfCidadao: digits(p.cpf) ?? undefined,
      nomeSocial: p.nome_social ?? undefined,
      nomeCompleto: p.nome,
      dtNascimento: toEpochMillis(p.data_nascimento),
      sexo: p.sexo === "F" ? "FEMININO" : "MASCULINO",
      racaCor: mapEnum(RACA_COR, p.raca_cor) ?? undefined,
      etnia: p.etnia ?? undefined,
      nomeMae: p.nome_mae ?? undefined,
      semNomeMae: !p.nome_mae,
      nomePai: p.nome_pai ?? undefined,
      semNomePai: !p.nome_pai,
      nacionalidade: mapEnum(NACIONALIDADE, p.nacionalidade ?? "brasileira") ?? 1,
      paisNascimento: p.pais_nascimento ?? undefined,
      municipioNascimento: p.municipio_nascimento ?? undefined,
      ufNascimento: p.uf_nascimento ?? undefined,
      dataNaturalizacao: toEpochMillis(p.data_naturalizacao) || undefined,
      portariaNaturalizacao: p.portaria_naturalizacao ?? undefined,
      dataEntradaBrasil: toEpochMillis(p.data_entrada_brasil) || undefined,
      telefoneCelular: digits(p.telefone) ?? undefined,
      email: p.email ?? undefined,
    },
    saidaCidadaoCadastro: undefined,
    statusTermoRecusaCadastroIndividualAtencaoBasica: !!p.recusa_cadastro,
    informacoesSocioDemograficas: {
      escolaridade: mapEnum(ESCOLARIDADE, p.escolaridade) ?? undefined,
      ocupacaoCodigoCbo2002: p.cbo ?? undefined,
      situacaoMercadoTrabalho: p.situacao_trabalho ?? undefined,
      povoComunidadeTradicional: p.povo_tradicional ?? undefined,
      orientacaoSexual: p.orientacao_sexual ?? undefined,
      identidadeGenero: p.identidade_genero ?? undefined,
      relacaoParentescoResponsavel: p.parentesco_responsavel ?? undefined,
      cnsResponsavelFamiliar: digits(p.cns_responsavel) ?? undefined,
    },
    condicoesSaude: p.condicoes_saude ?? undefined,
    emSituacaoDeRua: p.situacao_rua ? { ...p.situacao_rua } : undefined,
  };
}

// ---------- FAD: Ficha de Visita Domiciliar e Territorial ----------
export function buildFAD(v: any, cab: Cabecalho) {
  return {
    uuidFicha: v.uuid_ficha ?? cab.uuidFicha,
    tpCdsOrigem: 3,
    cnes: cab.cnesUnidade,
    ine: cab.ineEquipe ?? undefined,
    cnsProfissional: cab.cnsProfissional,
    cboCodigo_2002: cab.cboProfissional,
    dataAtendimento: toEpochMillis(v.data_visita) || cab.dataAtendimento,
    turno: v.turno === "manha" ? 1 : v.turno === "tarde" ? 2 : 3,
    microarea: v.microarea ?? undefined,
    forAArea: !!v.fora_area,
    cnsCidadao: digits(v.cns) ?? undefined,
    cpfCidadao: digits(v.cpf) ?? undefined,
    dataNascimentoCidadao: toEpochMillis(v.data_nascimento_cidadao) || undefined,
    sexoCidadao: v.sexo_cidadao === "F" ? "FEMININO" : v.sexo_cidadao === "M" ? "MASCULINO" : undefined,
    motivosVisita: {
      buscaAtiva: (v.motivos ?? []).includes("busca_ativa"),
      acompanhamento: (v.motivos ?? []).includes("acompanhamento"),
      egressoInternacao: (v.motivos ?? []).includes("egresso_internacao"),
      visitaPeriodica: (v.motivos ?? []).includes("visita_periodica"),
      condicoesAvaliadas: v.condicoes_avaliadas ?? [],
    },
    desfecho: v.desfecho === "realizada" ? 1 : v.desfecho === "recusada" ? 2 : 3,
    antropometria: v.antropometria ?? undefined,
  };
}
