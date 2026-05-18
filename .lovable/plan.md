# Plano: corrigir QR sobreposto, conselho profissional dinâmico e assinatura digital SpokenMED

## 1. QR de verificação nunca sobreposto

**Causa atual:** em `pdf-shared.ts`, a `drawVerificationBox` desenha o cartão (180×64) na **base-esquerda** (y = pageH − 142). No atestado, a linha de assinatura é centralizada em y = pageH − 140 e o texto "CRM/CBO/CNES" estende horizontalmente até cobrir a área do QR → sobreposição (exatamente o caso do print).

**Correções:**
- **Mover o cartão de verificação para a base-DIREITA** (x = pageW − 36 − boxW), reduzir para 170×62 com QR menor (50×50) e diminuir a fonte do texto. Fica num "canto" reservado, sem invadir o miolo.
- **Aumentar `PDF_FOOTER_MARGIN` de 70 → 150pt** — passa a reservar espaço para o footer (≈40pt) + cartão de verificação (≈80pt) + folga. Assim o `autoTable` (receita, SADT, LME, comprovante) nunca avança sobre o QR.
- **Atestado:** reposicionar o bloco de assinatura para `sigY = min(y + 80, pageH − PDF_FOOTER_MARGIN − 90)` e limitar a largura da linha/textos à zona central segura (margem 36 → pageW − boxW − 56). Quebrar `CRM · CBO · CNES` em duas linhas se necessário usando `splitTextToSize`.
- Adicionar `drawVerificationOnAllPages` uma checagem: se a página tem `autoTable.previous.finalY > pageH − PDF_FOOTER_MARGIN − 8`, força `addPage()` antes do QR (evita sobreposição em listas longas).

## 2. Conselho profissional dinâmico (CRM / CRO / CRP / COREN / CRF / CRFa / CREFITO / CRN…)

**Hoje:** `profissional.crm: "123456"` está **hardcoded** em `consultorio-dialog.tsx`. Quando o usuário logado é admin, sai "Administrador" sem nenhum registro de conselho válido — atestado inválido juridicamente.

**Mudanças:**
- **Migration**: adicionar à tabela `profiles`:
  - `conselho_tipo text` (enum-like: CRM, CRO, CRP, COREN, CRF, CRFa, CREFITO, CRN, CRM-V, CRESS, CRBio, outro)
  - `conselho_numero text`
  - `conselho_uf text` (2 chars)
  - `cbo text` (6 dígitos)
  - `especialidade text`
  - `rqe text` (opcional, Registro de Qualificação de Especialista)
  - `assinatura_secret text` (chave HMAC por profissional, gerada no insert via trigger; usada no hash)
- **Trigger** preenche `assinatura_secret` com `encode(gen_random_bytes(32), 'hex')` se NULL.
- **`use-auth.tsx`**: passar a selecionar esses campos no perfil.
- **Página `/app/configuracoes` (perfil do profissional)**: formulário para o médico cadastrar conselho/UF/CBO/especialidade/RQE. Validação de formato (números, UF, CBO 6 dígitos).
- **`consultorio-dialog.tsx`**: substituir o objeto `profissional` hardcoded por dados do `profile`. Se faltar `conselho_tipo` + `conselho_numero`, **bloquear impressão** de atestado/receita/LME/SADT com toast: "Cadastre seu conselho profissional em Configurações antes de emitir documentos." (admin sem conselho não imprime.)
- **`AtestadoOpts` / `ReceitaOpts` / etc.**: trocar `profissional.crm` por `profissional.conselho: { tipo, numero, uf }` + `cbo` + `especialidade` + `rqe`. Renderizar como `CRM 123456/RJ` ou `CRO 7890/SP` conforme o tipo.
- Salvar `profissional_conselho` formatado em `documentos_emitidos` (coluna já existe) → aparece corretamente na página `/verificar`.

## 3. Assinatura digital SpokenMED (selo verificável)

**Objetivo:** carimbo único impresso no PDF + página de verificação que prove que aquele documento saiu daquele profissional naquele momento. Não é ICP-Brasil (que exige certificado A3 do CFM/AR), mas é juridicamente útil como **assinatura eletrônica avançada** nos termos da Lei 14.063/2020 (aceita por órgãos públicos quando há mecanismo de verificação).

**Como funciona:**
- No momento da geração do PDF, server-function `assinarDocumento` recebe `{ protocolo, tipo, paciente_hash, profissional_id, conteudo_hash, emitido_em }` e devolve:
  - `assinatura`: HMAC-SHA256(payload, `profile.assinatura_secret`) — primeiros 32 hex chars formatados como `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`.
  - `selo_visual`: timestamp ISO + algoritmo.
- Salva `assinatura` + `payload_hash` em colunas novas de `documentos_emitidos` (`assinatura`, `assinatura_payload_sha`, `assinado_em`).
- **No PDF (todas as 5 modalidades)**: cartão de "Assinatura Eletrônica SpokenMED" ao lado do bloco do QR, com:
  - Hash da assinatura formatado.
  - Texto: "Assinatura eletrônica avançada — Lei 14.063/2020. Verifique em spokenmed.lovable.app/verificar."
  - Carimbo redondo "SpokenMED · ASSINADO" em teal sobre o nome do profissional.
- **Página `/verificar`**: ao consultar o protocolo, mostrar:
  - "✓ Assinatura íntegra" com hash exibido e data/hora.
  - Conselho profissional formatado (CRM/CRO/CRP).
  - Botão "Re-validar hash" que faz POST para server-fn `verificarAssinatura` (recalcula HMAC com o secret do profissional e compara).
  - Se diferir → "✗ Documento adulterado".

## 4. Arquivos afetados

**Migrations**
- `supabase/migrations/<ts>_profiles_conselho_assinatura.sql` — colunas em `profiles` + trigger de secret + colunas `assinatura/assinado_em/assinatura_payload_sha` em `documentos_emitidos`.

**Backend (server functions)**
- `src/lib/assinatura.functions.ts` — `assinarDocumento`, `verificarAssinatura` (HMAC-SHA256 com `requireSupabaseAuth`).

**Frontend**
- `src/lib/pdf-shared.ts` — `PDF_FOOTER_MARGIN` 150, `drawVerificationBox` à direita + bloco de assinatura, fonte do conselho dinâmica.
- `src/lib/pdf-atestado.ts`, `pdf-receita.ts`, `pdf-sadt.ts`, `pdf-lme.ts`, `pdf-comprovante.ts` — novo tipo `profissional.conselho`, chamada `assinarDocumento` antes de `registrarDocumento`, ajuste de layout do bloco de assinatura.
- `src/lib/documento-registry.ts` — campos extras (`assinatura`, `assinado_em`).
- `src/hooks/use-auth.tsx` — selecionar novos campos do perfil.
- `src/components/consultorio/consultorio-dialog.tsx` — usar `profile.conselho*`, bloqueio de impressão sem conselho.
- `src/routes/app.configuracoes.tsx` (ou criar) — formulário de cadastro do conselho.
- `src/routes/verificar.tsx` — exibir assinatura, botão de re-validar, mostrar conselho formatado.
- `src/integrations/supabase/types.ts` — regenerado automaticamente.

## 5. Fora de escopo (intencionalmente)

- Integração com ICP-Brasil real (exige certificado A3 emitido pelo CFM ou AR credenciada — projeto separado).
- Cadastro em massa de conselhos via CSV (admin pode editar individualmente por enquanto).
