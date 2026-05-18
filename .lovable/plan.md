## Atualizar versão do eSUS APS PEC para 5.4.30

Atualmente o módulo do médico exibe "eSUS PEC · CDS v4.3", que é uma versão antiga. O e-SUS APS PEC oficial está na **5.4.30** (rebrandado como "e-SUS APS"), e nessa versão o módulo do médico é o **Atendimento Individual (SOAP)** com transmissão por Thrift/LEDI mantendo CDS apenas como fallback offline.

### Mudanças

**1. `src/components/consultorio/consultorio-dialog.tsx`**
- Badge no cabeçalho do prontuário (linha 494-497): trocar  
  `"eSUS PEC · CDS v4.3"` → `"e-SUS APS PEC v5.4.30"`  
  e o badge ao lado de "Atendimento individual" passa a mostrar `"SOAP · LEDI 5.4"`.
- Botões "Finalizar e enviar ao eSUS PEC" (linhas 549 e 939): texto passa para `"Finalizar e enviar ao e-SUS APS"` (mais fiel ao rebrand atual).
- Tooltip / aria-labels equivalentes ajustados.

**2. `src/components/consultorio/envio-esus-overlay.tsx`** (overlay de transmissão)
- Título: `"Enviando ao eSUS PEC"` → `"Enviando ao e-SUS APS PEC 5.4.30"`.
- Subtítulo: incluir `"Atendimento Individual · LEDI 5.4"`.
- Etapa "Montando ficha CDS · v4.3" vira **"Montando ficha de Atendimento Individual · LEDI 5.4"**.
- Etapa "Transmitindo via Thrift" ganha detalhe `"/lotes/atendimentoIndividual · Thrift binary"`.
- Etapa "Compactando lote LEDI" detalhe vira `"LEDI 5.4 · gzip · SHA-256"`.
- Mensagem final: `"Ficha CDS transmitida e aceita pelo eSUS PEC."` → `"Atendimento Individual transmitido e aceito pelo e-SUS APS PEC 5.4.30."`
- Rodapé do recibo (Rows): adicionar linha `"Versão PEC"` com `"5.4.30 (build 20260201)"` e `"Schema LEDI"` com `"5.4"`. Manter Protocolo, Lote, CNES, Timestamp, Status.
- Chips do sucesso: manter CNS/CNES/INE/CBO/ICP-Brasil/LEDI e acrescentar `"PEC 5.4 ✓"`.

**3. Outros pontos com referência textual**
- Buscar e ajustar quaisquer strings remanescentes de "CDS v4.3", "v4.3" ou "eSUS PEC" sem versão dentro de `src/components/consultorio/` e do PDF de comprovante (se aparecer rodapé com versão antiga).

### Fora de escopo
- Nenhuma mudança no fluxo, no backend, nas tabelas ou nas funções de envio — apenas texto/aparência para refletir a versão real 5.4.30 do e-SUS APS PEC.