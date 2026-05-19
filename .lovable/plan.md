## Objetivo

Substituir o módulo XML atual (que ainda carrega marca/headers no estilo Fiorilli e gera strings concatenadas) por um **módulo oficial e-SUS APS LEDI**, alinhado ao Thrift/XSD publicado pela UFSC (https://integracao.esusab.ufsc.br/ledi/documentacao/thrift-xsd.html). A primeira ficha implementada de ponta-a-ponta é a **FVD — Ficha de Visita Domiciliar** (`tipoDadoSerializado = 8`), com arquitetura preparada para FAI, FP, FV, FCI, FCD.

## Princípios

- **100% padrão oficial LEDI**, sem nenhuma referência a "Fiorilli" / "SpokenMED" como rótulo de software remetente/originadora no XML. A identidade do remetente passa a ser configurável (default neutro: `contraChave = "SpokenMED-PEC"` + `versaoSistema = "1.0.0"`, sem string "FIORILLI").
- **Sem concatenação manual de strings**. Trocar por um builder XML seguro (`xmlbuilder2`), que cuida de namespaces, ordem de filhos, escape e self-closing.
- **TypeScript fortemente tipado**: cada bloco da LEDI vira uma interface (`HeaderTransport`, `Remetente`, `Originadora`, `Versao`, `VisitaDomiciliar`, `FichaVisitaDomiciliarMaster`, `DadoTransporte`).
- **Separação clara**:
  - `models/` — tipos puros (sem I/O).
  - `serializers/` — funções `toXml(model)` que devolvem string XML usando `xmlbuilder2`.
  - `mappers/` — convertem rows do Supabase em models (regra de negócio).
  - `index.ts` — função pública `exportarFichaVisitaDomiciliar(...)` que orquestra mapper → serializer → ZIP.
- **Compatibilidade com o importador XML do PEC**: namespaces oficiais, ordem de tags conforme XSD, datas em **epoch milliseconds (UTC)**, booleans como `true`/`false`, arrays como tags repetidas, UUID por ficha.

## Arquitetura

```text
src/lib/esus-ledi/
  index.ts                          // API pública (exportarFichaVisitaDomiciliar, ...)
  models/
    header-transport.ts             // HeaderTransport
    remetente.ts                    // Remetente, Originadora (DadoInstalacao)
    versao.ts                       // Versao { major, minor, revision }
    dado-transporte.ts              // DadoTransporte, TipoDadoSerializado enum
    fvd.ts                          // VisitaDomiciliar, FichaVisitaDomiciliarMaster
    fai.ts                          // (stub para próxima leva)
    enums.ts                        // Turno, Sexo, Desfecho, MotivoVisita, TipoImovel, etc.
  serializers/
    xml-builder.ts                  // wrapper fino sobre xmlbuilder2 (create, fragment, ele)
    envelope.ts                     // serializeDadoTransporte(dt) -> string XML
    header-transport.ts             // ele('headerTransport', {...})
    fvd.ts                          // serializeFichaVisitaDomiciliarMaster(model)
  mappers/
    fvd-from-db.ts                  // (row visita + paciente + unidade + prof) -> VisitaDomiciliar
    header-from-db.ts               // -> HeaderTransport
    remetente-from-config.ts        // -> Remetente / Originadora (config global)
  validators/
    cpf.ts, cns.ts, uuid.ts, ibge.ts, cnes.ts, ine.ts
  uuid.ts                           // gera UUID v4 conforme LEDI (44 chars com prefixo CNES)
  config.ts                         // RemetenteConfig (cpfOuCnpj, nomeOuRazaoSocial, versaoSistema, contraChave)
```

### Models (resumo)

```ts
export interface Versao { major: number; minor: number; revision: number }

export interface DadoInstalacao {
  contraChave: string;          // 1..255
  uuidInstalacao: string;       // 36..44
  cpfOuCnpj: string;            // 11..14 (apenas dígitos)
  nomeOuRazaoSocial: string;    // 1..255
  versaoSistema: string;        // 1..32
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

export interface HeaderTransport {
  profissionalCNS: string;          // 15
  cboCodigo_2002: string;
  cnes: string;                     // 7
  ine?: string;                     // 10
  dataAtendimento: number;          // epoch ms
  codigoIbgeMunicipio: string;      // 7
}

export interface VisitaDomiciliar {
  uuidFicha: string;                // 44
  turno?: 1 | 2 | 3;
  cpfCidadao?: string;              // 11
  cnsCidadao?: string;              // 15
  dtNascimento?: number;            // epoch ms
  sexo?: 0 | 1;                     // 0=F, 1=M
  statusVisitaCompartilhadaOutroProfissional: boolean;
  motivosVisita: number[];          // codes LEDI
  desfecho?: 1 | 2 | 3;             // 1=realizada,2=recusada,3=ausente
  microArea?: string;
  stForaArea: boolean;
  tipoDeImovel?: number;
}

export interface FichaVisitaDomiciliarMaster {
  uuidFicha: string;
  tpCdsOrigem: 3;
  headerTransport: HeaderTransport;
  visitasDomiciliares: VisitaDomiciliar[];   // repete N tags <visitasDomiciliares>
}

export interface DadoTransporte {
  uuidDadoSerializado: string;      // 44
  tipoDadoSerializado: TipoDadoSerializado;
  codIbge: string;                  // 7
  cnesDadoSerializado: string;      // 7
  ineDadoSerializado?: string;      // 10
  numLote: number;                  // bigint serializado como decimal
  ficha: FichaVisitaDomiciliarMaster /* | outras fichas */;
  remetente: DadoInstalacao;
  originadora: DadoInstalacao;
  versao: Versao;                   // default {6,3,5}
}
```

### Serialização (xmlbuilder2)

Wrapper `xml-builder.ts` expõe `create()`, `ele()`, `txt()`, `att()`. Os serializers montam o documento **respeitando a ordem do XSD**:

```ts
// serializers/envelope.ts
import { create } from "xmlbuilder2";
import { serializeFichaVisitaDomiciliarMaster } from "./fvd";

export function serializeDadoTransporte(dt: DadoTransporte): string {
  const doc = create({ version: "1.0", encoding: "UTF-8", standalone: true });
  const root = doc.ele("ns3:dadoTransporteTransportXml", {
    "xmlns:ns2": "http://esus.ufsc.br/dadoinstalacao",
    "xmlns:ns3": "http://esus.ufsc.br/dadotransporte",
    "xmlns:ns4": ns4UriFor(dt.tipoDadoSerializado),
  });
  root.ele("uuidDadoSerializado").txt(dt.uuidDadoSerializado);
  root.ele("tipoDadoSerializado").txt(String(dt.tipoDadoSerializado));
  root.ele("codIbge").txt(dt.codIbge);
  root.ele("cnesDadoSerializado").txt(dt.cnesDadoSerializado);
  if (dt.ineDadoSerializado) root.ele("ineDadoSerializado").txt(dt.ineDadoSerializado);
  root.ele("numLote").txt(String(dt.numLote));
  serializeFichaVisitaDomiciliarMaster(root, dt.ficha);   // <ns4:fichaVisitaDomiciliarMasterTransport>
  serializeDadoInstalacao(root, "ns2:remetente", dt.remetente);
  serializeDadoInstalacao(root, "ns2:originadora", dt.originadora);
  const v = root.ele("versao");
  v.att("major", String(dt.versao.major));
  v.att("minor", String(dt.versao.minor));
  v.att("revision", String(dt.versao.revision));
  return doc.end({ prettyPrint: false });
}
```

`serializeFichaVisitaDomiciliarMaster` emite:

```
<ns4:fichaVisitaDomiciliarMasterTransport>
  <uuidFicha>...</uuidFicha>
  <tpCdsOrigem>3</tpCdsOrigem>
  <headerTransport>...</headerTransport>
  <visitasDomiciliares>...</visitasDomiciliares>   (1..N)
</ns4:fichaVisitaDomiciliarMasterTransport>
```

`xmlbuilder2` cuida automaticamente do escape (`& < > " '`), self-closing e ordem de atributos.

### Validators

Funções puras lançando `Error` com mensagem específica para serem capturadas pelo orquestrador:

- `validateCpf(s)` — 11 dígitos + DV.
- `validateCns(s)` — 15 dígitos + algoritmo oficial (mod 11).
- `validateCnes(s)` — 7 dígitos.
- `validateIne(s)` — 10 dígitos.
- `validateIbge(s)` — 7 dígitos.
- `validateUuidLedi(s)` — 36..44 chars, prefixo CNES + UUID v4.

### UUID

`uuid.ts` gera UUID v4 (via `crypto.randomUUID()`, disponível no Worker) e prefixa com CNES (`${cnes}-${uuid}`), formato recomendado pela LEDI. Funciona tanto para `uuidDadoSerializado` quanto para `uuidFicha`.

### Função pública

```ts
// src/lib/esus-ledi/index.ts
export async function exportarFichaVisitaDomiciliar(input: {
  visitas: VisitaDomiciliarSource[];      // rows do Supabase já carregadas
  header: HeaderTransport;
  cnes: string;
  ine?: string;
  codIbge: string;
  numLote: number;
  remetente: DadoInstalacao;
  originadora?: DadoInstalacao;            // default = remetente
}): Promise<{ zip: Uint8Array; filename: string; arquivos: { name: string; uuid: string }[] }>;
```

Faz: map → validate → serialize → JSZip com **um arquivo `data/<uuidDadoSerializado>.xml` por lote** (a LEDI permite múltiplas visitas em um único Master; vamos emitir 1 Master por exportação, contendo N `<visitasDomiciliares>`).

### Integração com `esus-export.functions.ts`

- Adiciona branch `formato === "xml-oficial"` (e torna default).
- Remove os call sites para `src/lib/esus-xml/*` antigos (Fiorilli) **apenas no caminho FVD nesta entrega**; FAI/FAO/FCI/FCD continuam temporariamente apontando para o módulo antigo até serem migrados.
- Lê config do remetente de uma nova tabela `esus_remetente_config` (uma linha por tenant) **ou** de variáveis em `process.env` se a tabela estiver vazia — assim o usuário consegue trocar `cpfOuCnpj`/`nomeOuRazaoSocial` sem deploy.

### Limpeza

- Remover blocos `<!-- SPOKENMED SIS LTDA -->` e nomes "SpokenMED SIS - x.y" da nova trilha. O envelope oficial não traz comentários nem branding.
- Apagar o helper `escape.ts` antigo só depois que todas as fichas estiverem migradas (entrega futura). Nesta PR mantemos os dois módulos lado a lado.

## Dependências

- `bun add xmlbuilder2` — Worker-compat, sem nativos.
- Sem outras libs novas.

## Migração de banco

Adicionar tabela:

```sql
create table public.esus_remetente_config (
  id uuid primary key default gen_random_uuid(),
  contra_chave text not null,
  cpf_ou_cnpj text not null,
  nome_ou_razao_social text not null,
  versao_sistema text not null default '1.0.0',
  uuid_instalacao uuid not null default gen_random_uuid(),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: admin all; staff select.
```

(`num_lote` já existe em `esus_exportacoes`, ok.)

## Fora de escopo

- Migrar FAI/FAO/FCI/FCD para o novo módulo (próxima leva — mesma arquitetura, novos serializers).
- UI para editar `esus_remetente_config` (entrega seguinte).
- Validar contra o XSD oficial (faço se você anexar o `.xsd`).

## Plano de execução

1. **Migration** `esus_remetente_config` + RLS.
2. `bun add xmlbuilder2`.
3. Criar `src/lib/esus-ledi/` (models, serializers, mappers, validators, uuid, config, index).
4. Em `esus-export.functions.ts`: novo branch FVD usando `exportarFichaVisitaDomiciliar`; default passa a ser `xml-oficial`.
5. Smoke test: gerar 1 lote real de FVD, abrir o XML, conferir namespaces/ordem/epoch/booleans e tentar importar no PEC.
6. Documentar no `LEIA-ME.txt` do ZIP: "XML oficial e-SUS APS LEDI 6.3.5".

Posso seguir?