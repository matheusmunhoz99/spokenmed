## Exportação para o e-SUS PEC (CDS Thrift)

Objetivo: permitir gerar, em "Exportações → Exportar cadastros", um arquivo `.zip` (formato CDS offline, Apache Thrift) contendo as fichas **FCD** (Domiciliar/Territorial), **FCI** (Individual) e **FAD** (Atendimento/Visita Domiciliar), pronto para ser importado no PEC pelo módulo **Transporte CDS**.

---

### Antes de avisar: pré-requisitos do PEC (importante)

Para o PEC aceitar a importação, cada lote precisa estar atrelado a um **profissional CDS válido** já cadastrado no PEC daquela instalação:

- **CNS do profissional** que está enviando (geralmente o ACS/recepção)
- **CBO** dele
- **CNES da unidade** (UBS)
- **INE da equipe** (eSF/eAP)
- **IBGE do município** (7 dígitos)

Sem esses dados, o PEC rejeita o arquivo. Vamos cadastrar isso no sistema (passos 1 e 2 abaixo).

---

### 1. Banco — novas colunas e tabelas

**Migration** (vou pedir aprovação antes):

- `unidades`
  - `ine` text (código da equipe – pode haver mais de uma; ver tabela nova abaixo)
  - `ibge_municipio` text(7)
  - `uf` text(2), `cep`, `logradouro`, `numero`, `bairro` (separar do campo único `endereco` atual)
  - `tipo_unidade` text (código CNES)

- nova tabela `equipes`
  - `id`, `unidade_id`, `ine` text(10), `nome`, `tipo_equipe` (eSF, eAP1, eAP2…), `ativo`

- `profissionais` / `profiles`
  - garantir `cns` text(15) (hoje não temos no `profissionais`), `cbo` (já existe), `equipe_id`

- `domicilios` — adicionar campos obrigatórios/condicionais do LEDI FCD que faltam:
  - `cns_responsavel_tecnico` (profissional que cadastrou), `cbo_responsavel`, `ine_equipe`, `cnes_unidade`, `data_cadastro`, `ficha_atualizacao` (bool), `uuid_ficha` (chave do PEC)
  - `condicao_moradia` (cod), `localizacao` (urbana/rural), `stSemNumero`, `telefone_contato`, `telefone_residencia`, `email`, `numero_familias`, `stMudouSe`, `statusTermoRecusa`, `stVersaoLongaSaudeMental`, etc. (lista exata fica no script da migration; uso defaults seguros)
  - já temos a maioria de moradia, mas vou normalizar para os **códigos LEDI** (mapeamento `texto interno → código LEDI` numa tabela `esus_codigos` ou enum)

- `familias`
  - `numero_prontuario_familiar` (já existe), `data_cadastro`, `stMudouSe`, `responsavel_familiar_cns` (preencher via membro `is_responsavel`), `renda_familiar` (já existe)

- `pacientes` (para FCI)
  - `raca_cor` (cod LEDI), `etnia` (se indígena), `nacionalidade`, `pais_nascimento` (se estrangeiro), `municipio_nascimento_ibge`, `uf_nascimento`, `escolaridade` (cod), `situacao_mercado_trabalho` (cod), `ocupacao_cbo`, `orientacao_sexual`, `identidade_genero`, `frequenta_escola`, `religiao`, `povo_comunidade_tradicional`, `responsavel_familiar` (bool), `peso_nascimento`, `condicoes_saude` (jsonb — diabetes, HAS, gestante, fumante, …), `em_situacao_rua` (bloco completo com tempo, alimentação, higiene, …), `cidadao_pertence_a_outra_equipe` (bool)
  - validações: pelo menos um identificador (CPF **ou** CNS), data de nascimento, sexo, nome

- `visitas_domiciliares` (para FAD)
  - já tem `motivos`, `acompanhamentos`, `desfecho`, GPS, peso/PA. Falta: `turno` já existe; precisa `cns_acs`, `cbo_acs`, `ine_equipe`, `cnes_unidade`, `microarea`, `stForaArea`, `uuid_ficha`
  - mapeamento de `motivos`/`acompanhamentos` para os **códigos LEDI** numa tabela de domínio

- nova tabela `esus_exportacoes`
  - `id`, `criado_por`, `criado_em`, `unidade_id`, `equipe_id`, `profissional_id`, `tipo_fichas` (jsonb: FCD/FCI/FAD), `intervalo_inicio`/`fim`, `total_fichas`, `arquivo_path` (storage), `status` ('pendente','gerando','pronto','erro'), `erro_msg`, `lote_uuid`
  - bucket Storage `esus-exportacoes` privado, RLS por unidade/admin

---

### 2. Telas

#### 2a. Configurações → Unidades (ajustes)
- Editar UBS para preencher CNES, IBGE, endereço estruturado e cadastrar Equipes (INE).

#### 2b. Configurações → Profissionais (ajustes)
- Garantir CNS, CBO e vínculo de Equipe para todo profissional que vai assinar exportações.

#### 2c. Nova rota `/app/exportar-esus` (Admin / Coord.)
Wizard de 4 passos:

1. **Escopo**
   - Unidade e Equipe (filtra ACS daquela equipe)
   - Profissional CDS (CNS+CBO) que vai assinar o lote
   - Período (data de cadastro/atualização). Default: últimos 30 dias.
   - Quais fichas: ☑ Domiciliar (FCD) ☑ Individual (FCI) ☑ Visita (FAD)
   - "Somente novos" / "Novos + atualizados desde último envio"

2. **Pré-validação**
   - Lista quantas fichas serão geradas
   - Mostra **erros bloqueantes** (ex.: 12 domicílios sem GPS, 5 cidadãos sem CPF nem CNS, 3 visitas sem motivo) com link "abrir registro pra corrigir"
   - Mostra **avisos** (campos opcionais faltando)
   - Botão "Baixar relatório de pendências (CSV)"

3. **Gerar**
   - Server function `gerarExportacaoEsus` (TanStack `createServerFn`):
     - Carrega dados, monta objetos Thrift
     - Serializa com `thrift` (binary protocol) usando o IDL oficial do BRIDGE/UFSC
     - Empacota num `.zip` com a estrutura esperada pelo PEC (`/dados/CDS*.cds`, `/manifesto`)
     - Salva em Storage privado e registra em `esus_exportacoes`
   - Mostra progresso (polling do status)

4. **Concluir**
   - Botão "Baixar .zip" e instruções: PEC → Transporte CDS → Receber/Importar
   - Histórico de exportações (lista com status, totais, autor, lote_uuid)

---

### 3. Backend (server functions, sem Edge Function)

Arquivos novos em `src/lib/`:

- `esus-codigos.ts` — mapas oficiais do LEDI 7.4 (raça, escolaridade, condição moradia, motivos visita, desfecho, CBO, tipos imóvel, animais, água, esgoto, lixo, etc.) — uso de constantes; muito desses códigos já existem nos enums internos só precisam virar tabelas de tradução.
- `esus-validators.ts` — Zod com todas as regras condicionais do LEDI (#1..#N da FCD, idem FCI e FAD).
- `esus-thrift/` — IDL `.thrift` do BRIDGE/UFSC + tipos TypeScript gerados (rodando `thrift --gen js:ts ...` no build, ou commitando os arquivos gerados).
- `esus-export.functions.ts` — `previewExportacao`, `gerarExportacaoEsus`, `getStatusExportacao`, `baixarExportacao` (assinada). Roda com `requireSupabaseAuth` + role admin/coordenador.

Pacotes: `thrift` (cliente JS), `jszip` (já leve).

---

### 4. Riscos / pontos a confirmar com a prefeitura

- **Versão do LEDI** ativa no PEC daquela instalação (7.3 vs 7.4) — vou implementar 7.4 (atual). Se for 7.3, é só trocar o IDL.
- **Origem do envio**: PEC marca o lote como vindo de "CDS offline" — algumas prefeituras restringem importação a CNES específicos. Por isso a UI exige escolher unidade+profissional autorizado.
- O PEC rejeita ficha duplicada (mesmo `uuid_ficha` + mesma versão). Gerar UUIDs determinísticos por entidade para reenvio funcionar sem duplicar.

---

### 5. Entrega em fases (sugerida)

- **Fase 1 (esta entrega)**: migration + tela de cadastro/edição de Unidade/Equipe com CNES/INE/IBGE + esqueleto da tela de exportação com pré-validação real (mostra o que falta nos cadastros).
- **Fase 2**: geração do `.zip` Thrift para **FCD** (fluxo end-to-end com a ficha mais simples primeiro).
- **Fase 3**: **FCI**.
- **Fase 4**: **FAD** + histórico, reenvio, "diferencial desde último envio".

Cada fase termina com algo testável. Se aprovar, começo pela Fase 1.
