# Plano

## 1. Builders Thrift faltantes (LEDI 7.4)

Criar em `src/lib/esus-thrift/builders/`:

- `fac.ts` — Ficha de Atividade Coletiva
- `fp.ts` — Ficha de Procedimentos
- `fvd.ts` — Ficha de Visita Domiciliar e Territorial
- `fmca.ts` — Ficha de Marcadores de Consumo Alimentar
- `fae.ts` — Ficha de Atendimento Especializado (NASF/CEO)
- `fczm.ts` — Ficha de Avaliação de Zika/Microcefalia
- `fv.ts` — Ficha de Vacinação

Cada builder segue o padrão dos existentes (`fai.ts`, `fad.ts`): função `buildXxxThrift(row)` que serializa em `TBinaryProtocol` os campos do registro conforme XSD/Thrift LEDI 7.4, devolvendo `Uint8Array`.

Registrar cada um em:
- `src/lib/esus-thrift/transporte.ts` no mapeamento de `TipoDadoSerializado`
- `src/lib/esus-export.functions.ts` na seleção por `tipos_fichas`

## 2. Persistência das fichas no banco

Cada ficha precisa de uma tabela própria (ou reaproveitar `atendimentos`/`domicilios`/`pacientes` quando já existe) com os campos:

- `status_envio` enum: `pendente` | `exportado` | `desatualizado`
- `exportado_em` timestamptz
- `exportacao_id` uuid (fk para `esus_exportacoes`)
- `updated_at` (trigger) — usado para marcar `desatualizado` se editado depois de exportado

Tabelas novas a criar (somente as que ainda não existem):
- `fichas_atividade_coletiva` (FAC)
- `fichas_procedimentos` (FP) — pode derivar de `atendimentos.procedimentos_sigtap`
- `fichas_visita_domiciliar` (FVD)
- `fichas_marcadores_alimentares` (FMCA)
- `fichas_atendimento_especializado` (FAE) — derivada de `atendimentos` com flag
- `fichas_zika_microcefalia` (FCZM)
- `fichas_vacinacao` (FV)

E adicionar `status_envio`/`exportado_em`/`exportacao_id` em:
- `atendimentos` (FAI/FAD)
- `pacientes` (FCI)
- `domicilios` (FCD)

Trigger: ao `UPDATE` de qualquer ficha exportada, voltar `status_envio` para `desatualizado`.

## 3. Fluxo "Encerrar consulta" (substitui o botão Exportar eSUS)

Em `src/components/consultorio/consultorio-dialog.tsx`:

- Remover botão "Exportar eSUS" do rodapé.
- Único botão final: **Encerrar consulta**.
- Ao clicar:
  1. Validar campos obrigatórios eSUS (CID/CIAP, procedimentos SIGTAP, turno, modalidade, tipo de atendimento, local, condutas). Se faltar, abrir toast/modal com a lista de pendências e bloquear o encerramento.
  2. Salvar atendimento no banco com `status_envio = 'pendente'` e `finalizado_em = now()`.
  3. Fechar o dialog. Não enviar arquivo nenhum — exportação fica para `/app/exportar-esus`.

## 4. Regra de reabertura (2 horas)

- Mostrar botão "Reabrir" apenas se `now() - finalizado_em < interval '2 hours'` **e** `status_envio != 'exportado'`.
- Após 2h, atendimento fica somente-leitura (ver/imprimir, mas não editar).
- Backend: RLS/policy de UPDATE em `atendimentos` checando a janela de 2h (ou trigger `BEFORE UPDATE` que rejeita).

## 5. Exportador só pega pendentes/desatualizadas

Em `src/lib/esus-export.functions.ts`:

- Filtrar consultas por `status_envio IN ('pendente','desatualizado')` no intervalo selecionado.
- Após gerar e baixar o `.zip`/`.esus` com sucesso (status `concluido` em `esus_exportacoes`), fazer UPDATE em todas as fichas incluídas:
  - `status_envio = 'exportado'`
  - `exportado_em = now()`
  - `exportacao_id = <lote.id>`
- Mesma regra para FCI (pacientes) e FCD (domicílios): só exporta se `pendente` ou `desatualizado`.

## 6. Detalhes técnicos

- Migração única com: novas tabelas, novas colunas, enum `ficha_status_envio`, triggers de invalidação e função `marcar_fichas_exportadas(lote_uuid uuid)`.
- Server function nova: `encerrarAtendimento({ atendimentoId })` valida + salva + retorna pendências.
- Server function `reabrirAtendimento({ atendimentoId })` checa janela 2h.
- Ajustar `esus-export.functions.ts` para chamar `marcar_fichas_exportadas` ao final.
- UI de `/app/exportar-esus` ganha contador "X fichas pendentes" por tipo antes de gerar.

## Itens fora do escopo (confirmar se quer também)
- Geração automática de FP a partir dos procedimentos_sigtap de `atendimentos` (vs. tabela própria).
- FAE: separar por CBO NASF/CEO automaticamente ou exigir flag manual.
