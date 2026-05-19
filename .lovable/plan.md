## Leitura honesta antes do plano

Vasculhei a especificação. Aqui está a verdade técnica que precisa ficar clara antes de eu sair codando:

1. **O que o PEC aceita de fato é Thrift binário**, não JSON. Cada ficha vira bytes serializados com Apache Thrift (TBinaryProtocol), embrulhada em uma struct `DadoTransporte` (com `uuidDadoSerializado`, `tipoDadoSerializado`, `dadoSerializado: binary`, `cnesDadoSerializado`, `ineDadoSerializado`, `dataHoraTransporte`, `versaoSistema`), e o conjunto vai dentro de um `DadoInstalacao`, tudo dentro de um `.zip` com naming convention específico.
2. **Hoje a exportação no projeto gera JSON-LEDI**, que serve para conversores externos (Bridge UFSC, etc.), mas **NÃO é importável diretamente no PEC**. Para o PEC aceitar de verdade, precisa ser Thrift binário válido + estrutura de transporte correta + headerTransport com CNS/CBO/CNES/INE validados pelos algoritmos oficiais.
3. **Escopo total da LEDI 7.4** = 12 fichas (FCI, FCD, FAI, FAO, FAC, FP, FVD, MCA, FAE, FAD, FCZM, FV) com ~50 structs Thrift filhas, dezenas de enums, validações de CNS/CPF/CNES/CEP/IBGE, regras de CBO×ficha, cardinalidades mín/máx. Implementar 100% é trabalho de várias semanas.
4. **O que dá pra fazer com qualidade** é focar nas 3 fichas que você já usa e que pediu antes: **FCD, FCI, FAD** — fazer Thrift binário de verdade para essas 3, com camada de transporte completa, e deixar o resto fora desta entrega.

## Plano proposto (escopo: FCD + FCI + FAD em Thrift binário real)

### Fase A — Infraestrutura Thrift no Worker
- Instalar `thrift` (JS puro, funciona em Cloudflare Workers — sem binário nativo).
- Criar `src/lib/esus-thrift/idl/` com as IDLs `.thrift` oficiais das 3 fichas + transporte + header + versao + structs filhas (CondicoesDeSaude, IdentificacaoUsuarioCidadao, InformacoesSocioDemograficas, EmSituacaoDeRua, SaidaCidadaoCadastro, CadastroDomiciliar, FamiliaRow, EnderecoLocalPermanencia, CondicaoMoradia, InstituicaoPermanencia, FichaAtendimentoDomiciliarMaster, FichaAtendimentoDomiciliarChild, ProblemaCondicaoAI, UnicaLotacaoHeader, DadoTransporte, DadoInstalacao, Versao).
- Gerar tipos TS a partir das IDLs (script de build) ou escrever manualmente os encoders TBinaryProtocol (mais leve, sem dependência de gerador).

### Fase B — Builders por ficha (Thrift binário)
- `src/lib/esus-thrift/builders/fcd.ts` — monta `CadastroDomiciliarThrift` a partir de `domicilios` + `familias` + `familia_membros` + `equipes` + `unidades`.
- `src/lib/esus-thrift/builders/fci.ts` — monta `CadastroIndividualThrift` a partir de `pacientes`.
- `src/lib/esus-thrift/builders/fad.ts` — monta `FichaAtendimentoDomiciliarMaster/Child` a partir de `visitas_domiciliares`.
- Cada builder: aplica defaults, valida campos obrigatórios, traduz enums internos para códigos LEDI 7.4, e devolve `Buffer` (Thrift binário).

### Fase C — Camada de transporte e empacotamento
- `src/lib/esus-thrift/transporte.ts` — embrulha cada ficha em `DadoTransporte` (com UUID v4, tipoDadoSerializado correto, CNES do header, INE, dataHoraTransporte, versao=`'7.4.0'`, origem=`'OUTROS_SISTEMAS'`).
- `src/lib/esus-thrift/pack.ts` — agrupa em `DadoInstalacao` + serializa + gera `.zip` com layout que o PEC espera (`/transporte.bin` + assinatura/manifest se necessário).
- Atualiza `gerarExportacaoEsus` em `src/lib/esus-export.functions.ts` para usar o novo pipeline binário quando o usuário escolher "Thrift CDS Offline" (manter JSON como modo alternativo, marcado como "Bridge UFSC").

### Fase D — Validações oficiais
- `src/lib/esus-validators.ts`: implementar **algoritmo de validação do CNS** (módulo 11 ponderado, regras dos dígitos iniciais 1/2/7/8/9) e **CNES** (7 dígitos numéricos). CPF já existe no projeto, vou reusar.
- Bloquear geração se header não tiver CNS+CBO+CNES+INE válidos, com mensagem clara.

### Fase E — UI
- Em `app.exportar-esus.tsx`: adicionar seletor "Formato": (1) Thrift binário (PEC offline) — default agora; (2) JSON-LEDI (Bridge UFSC).
- Tela de pré-validação já existe; só adiciona checagens novas (CNS válido, CBO válido por ficha, INE 10 dígitos).

## O que fica de fora desta entrega (e por quê)

- **FAI, FAO, FAC, FP, FVD, MCA, FAE, FCZM, FV** — não estão em uso no seu sistema ainda. Adicionar todas dobraria o tempo sem benefício imediato. Posso fazer cada uma em uma entrega separada quando precisar.
- **API de transmissão online** (POST direto pro PEC com OAuth) — fora de escopo; você usará import offline pelo painel do PEC.
- **Assinatura digital do lote** (se o seu município exigir) — se for necessário, eu adiciono depois com certificado A1/A3.

## Estimativa

Fases A+B+C+D+E em uma sequência só, ~5-6 entregas (cada uma com migration ou refactor). Não dá pra fazer tudo num único turno sem quebrar.

## Decisão que preciso de você

1. **OK fechar escopo em FCD + FCI + FAD em Thrift binário real?** Ou prefere que eu mantenha o JSON-LEDI atual e adicione as outras 9 fichas em JSON também (menos útil, mas mais cobertura)?
2. **Tem algum município/PEC específico que vai receber o arquivo?** Versão exata do PEC (5.3, 5.4) muda detalhes do `.zip` (nome de arquivo dentro, manifest).