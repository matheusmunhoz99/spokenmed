## Objetivo

Trocar o conteúdo do ZIP exportado para o PEC e-SUS pelo formato **XML transport** (igual aos exemplos do Fiorilli SIS), com a marca SpokenMed nos campos fixos. Cada ficha vira **1 arquivo `.xml`** dentro do ZIP, no formato `dadoTransporteTransportXml` com namespaces `ns2` (`dadoinstalacao`), `ns3` (`dadotransporte`) e `ns4` (master da ficha).

## Escopo desta entrega

Tipos de ficha suportados nesta primeira leva (cobrem o que o app gera hoje):

- **FAI** — Ficha de Atendimento Individual (`tipoDadoSerializado=4`, ns4 `fichaatendimentoindividualmaster`)
- **FVD** — Ficha de Visita Domiciliar (`tipoDadoSerializado=8`, ns4 `fichavisitadomiciliarmaster`) — substitui o uso atual de "FAD"
- **FCI** — Cadastro Individual (`tipoDadoSerializado=1`)
- **FCD** — Cadastro Domiciliar (`tipoDadoSerializado=2`)
- **FAO** — Atendimento Odontológico (`tipoDadoSerializado=5`)

Versão LEDI declarada no XML: `<versao major="6" minor="3" revision="5"/>` (igual ao exemplo Fiorilli, que é o que o PEC offline aceita via importador XML).

## Arquitetura

### Novo módulo `src/lib/esus-xml/`

```
src/lib/esus-xml/
  index.ts            // export público dos builders
  envelope.ts         // monta <ns3:dadoTransporteTransportXml> + remetente/originadora/versao
  escape.ts           // escapeXml + helpers
  uuid.ts             // gera uuidDadoSerializado no padrão "<cnes>-<random10>-<sigla>-0000-0000-<seq>"
  fai.ts              // <ns4:fichaAtendimentoIndividualMasterTransport>
  fvd.ts              // <ns4:fichaVisitaDomiciliarMasterTransport>
  fci.ts              // <ns4:fichaCadastroIndividualMasterTransport>
  fcd.ts              // <ns4:fichaCadastroDomiciliarMasterTransport>
  fao.ts              // <ns4:fichaAtendimentoOdontologicoMasterTransport>
```

Cada builder recebe o objeto da ficha + header + dados da unidade/profissional e devolve uma **string XML** completa do envelope. Sem dependência de libs externas: usamos template strings + `escapeXml` (`& < > " '`) já que o conteúdo é controlado.

### Identidade SpokenMed (campos fixos `<ns2:remetente>` / `<ns2:originadora>`)

```
contraChave       = "SpokenMED SIS - 1.0.0"
uuidInstalacao    = exp.lote_uuid                      // UUID por lote
cpfOuCnpj         = "00000000000000"                   // placeholder; tornar configurável depois
nomeOuRazaoSocial = "SpokenMED SIS - 1.0.0 - <SIGLA>"  // FAI/FVD/FCI/FCD/FAO
versaoSistema     = "1.0.0"
```

`<versao major="6" minor="3" revision="5"/>` fixo.

### `numLote`

Adicionar coluna `num_lote` (BIGSERIAL) na tabela `esus_exportacoes` para gerar um inteiro incremental por exportação (o XML precisa de `<numLote>`). Migration pequena.

### `uuidDadoSerializado`

Padrão visto no exemplo:
`{CNES}-{10digits}-{SIGLA}-0000-0000-{10digits}`

Implementação: `<cnes>-<rand10>-<sigla>-0000-0000-<numLote.padStart(10,'0')>`. Sigla por tipo: FDAI (FAI), FDVD (FVD), FDCI (FCI), FDCD (FCD), FDAO (FAO).

### Mudanças em `src/lib/esus-export.functions.ts`

- Trocar o default de `formato` para `"xml"` e adicionar `"xml"` ao enum (`thrift` e `json` continuam funcionando como fallback).
- Quando `formato === "xml"`:
  - Para cada ficha que hoje empacotamos via `packLDI`, chamar o builder XML correspondente e gravar `data/<uuidDadoSerializado>.xml` no `JSZip`.
  - Continuar gravando `manifest.json` + `LEIA-ME.txt` curtos (informativos; o PEC ignora).
  - `contentType: "application/zip"`, nome `${cnes}_${inicio}_${fim}_${lote}.xml.zip`.
- Reaproveitar todo o pipeline atual de:
  - Filtros (`finalizado_em not null` para FAI/FAO, validações de paciente).
  - Marcação `marcar_fichas_exportadas` no final.
  - Erro "Nenhuma ficha válida…" se zerar.

### Mapeamentos de campo XML (resumo)

**FAI (`<atendimentosIndividuais>`):**

- `numeroProntuario`, `cpfCidadao` ou `cnsCidadao`, `dataNascimento` (epoch ms), `sexo` (0=F,1=M), `turno` (1/2/3), `tipoAtendimento`, `localDeAtendimento`.
- `medicoes` (peso/altura quando houver) — viram nós opcionais.
- `problemasCondicoes` — repetir para cada CID-10 / CIAP-2 em `atendimentos.cids`.
- `condutas` — derivado de `atendimentos.conduta`.
- `dataHoraInicialAtendimento` / `dataHoraFinalAtendimento` — `atendimentos.iniciado_em` / `finalizado_em`.
- `exame` (repetido) — quando `atendimentos.exames` existir.

**FVD (`<visitasDomiciliares>`):**

- `turno`, `numProntuario`, `cpfCidadao`/`cnsCidadao`, `dtNascimento`, `sexo`, `motivosVisita` (repetido), `desfecho` (1/2/3), `microArea`, `stForaArea`, `tipoDeImovel`, `statusVisitaCompartilhadaOutroProfissional`.

Campos não-mapeáveis no schema atual ficam **omitidos** (são opcionais no XSD do PEC).

### `headerTransport`

Reutiliza os dados que já levantamos:
`profissionalCNS`, `cboCodigo_2002`, `cnes`, `ine`, `dataAtendimento` (epoch ms — meia-noite UTC do dia do atendimento), `codigoIbgeMunicipio`.

## Fora de escopo (próxima etapa, se você pedir)

- Builders XML para FAC, FP, FAE, FCZM, FV, FMCA (hoje são stubs).
- Configurar CNPJ real / `contraChave` por tenant.
- Validar contra o XSD oficial do PEC (faço se você anexar o XSD).

## Plano de execução

1. Migration: `ALTER TABLE esus_exportacoes ADD COLUMN num_lote BIGSERIAL;`.
2. Criar `src/lib/esus-xml/*` (envelope + 5 builders + helpers).
3. Em `esus-export.functions.ts`: adicionar branch `formato === "xml"`, default `xml`.
4. Ajustar `src/routes/app.exportar-esus.tsx` para passar `formato: "xml"` no `gerarExportacaoEsus`.
5. Smoke test: gerar um lote real, abrir um `.xml` do ZIP e comparar com os exemplos Fiorilli.

Posso seguir?
