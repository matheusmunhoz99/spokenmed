
## Objetivo
1. Eliminar 100% das referências a `lovable.app` nos PDFs e QR codes — passar tudo a usar `https://spokenmed.oppcloud.com.br`.
2. Adicionar suporte oficial a **receita amarela** (Notificação de Receita "A" — entorpecentes/psicotrópicos lista A1/A2/A3, ex.: Venvanse/lisdexanfetamina), e também à **Notificação B (azul)** já que o módulo nasce pronto — atendendo Portaria SVS/MS 344/98.

---

## Parte 1 — Domínio próprio em QRs e rodapés

### Centralizar a base URL
- Criar `src/lib/verificacao-url.ts` exportando:
  - `VERIFY_BASE = "https://spokenmed.oppcloud.com.br"`
  - `VERIFY_HOST = "spokenmed.oppcloud.com.br"`
  - `buildVerifyUrl(protocolo, extra?)` → `${VERIFY_BASE}/verificar?p=...`
- Substituir todas as 7 ocorrências hardcoded de `spokenmed.lovable.app`:
  - `src/lib/pdf-shared.ts` (linhas 91 e 142 — texto "Verifique em…")
  - `src/lib/pdf-receita.ts`, `pdf-atestado.ts`, `pdf-sadt.ts`, `pdf-lme.ts`, `pdf-comprovante.ts` (URL do QR)
- Auditar também `src/components/verificar/qr-scanner-dialog.tsx`, `src/routes/verificar.tsx`, manifest/meta tags e qualquer `index.html` em busca de "lovable" residual.

### Garantir que `/verificar` funcione no domínio próprio
- Já é uma rota TanStack; o domínio `spokenmed.oppcloud.com.br` está conectado e ativo, então `https://spokenmed.oppcloud.com.br/verificar?p=...` resolve. Validar com um link de teste depois do deploy.

---

## Parte 2 — Notificação de Receita A (amarela) e B (azul)

### Modelo legal a respeitar (Portaria 344/98)
- **Amarela (A1/A2/A3)** — entorpecentes e psicotrópicos anorexígenos. Inclui **Venvanse, Ritalina, morfina, metadona**.
- **Azul (B1/B2)** — psicotrópicos (Rivotril, Stilnox) e anorexígenos.
- Exigências do impresso: numeração sequencial da Notificação, identificação completa do emitente pré-impressa (nome, especialidade, CRM/UF, endereço, telefone), identificação do comprador (nome, RG, endereço), validade de 30 dias, quantidade por extenso, somente UF onde a notificação foi emitida.

### Mudanças no tipo `ReceitaTipo`
Em `src/lib/pdf-receita.ts`:
```ts
export type ReceitaTipo =
  | "comum"
  | "controle_especial"      // branca, 2 vias
  | "antimicrobiano"         // branca, 2 vias
  | "notificacao_a"          // AMARELA — A1/A2/A3
  | "notificacao_b";         // AZUL — B1/B2
```

### Novos campos em `GerarReceitaOpts`
```ts
notificacao?: {
  numero: string;            // numeração sequencial do talonário (obrigatório p/ A e B)
  uf_emissao: string;        // UF onde foi emitida
  validade_dias?: number;    // default 30
};
comprador?: { nome?: string; rg?: string; endereco?: string };
```

### Layout dos novos receituários
Nova função `drawNotificacao(doc, opts, cor, logo)` em `pdf-receita.ts`:
- **Fundo amarelo claro** (`#FFF7CC`) p/ tipo A, **azul claro** (`#D6E6FF`) p/ tipo B — `doc.setFillColor` em retângulo de página inteira antes do header.
- Cabeçalho com título `"NOTIFICAÇÃO DE RECEITA A"` (ou B) e cor de destaque correspondente.
- Faixa superior direita com **"Nº " + `opts.notificacao.numero`** em fonte grande negrito.
- Bloco "IDENTIFICAÇÃO DO EMITENTE" obrigatório (nome, CRM/UF, CBO, endereço da unidade, telefone se houver).
- Quantidade do medicamento **por extenso** automática (helper `numeroPorExtenso`).
- Bloco "IDENTIFICAÇÃO DO COMPRADOR" (nome, RG, endereço) — pré-preenchido se `opts.comprador` vier, senão linhas em branco.
- Bloco "IDENTIFICAÇÃO DO FORNECEDOR / FARMÁCIA" (linhas em branco para preenchimento manual).
- Rodapé com validade: `"Validade: 30 dias a contar da data de emissão · Válida somente no estado de {UF}"`.
- Duas vias: **1ª via — Retenção em Farmácia**, **2ª via — Paciente**.

### Validação antes de gerar
- Em `consultorio-dialog.tsx` (onde o usuário escolhe o tipo): se `tipo === "notificacao_a" || "notificacao_b"`, exigir `numero` e `uf_emissao` num pequeno form modal antes de chamar `gerarReceitaPdf`. Bloquear emissão se vazios.

### UI de seleção do tipo de receita
- Adicionar 2 opções no seletor existente: "Notificação A (amarela) — Venvanse, Ritalina…" e "Notificação B (azul) — Rivotril, Stilnox…".
- Tooltip explicativo: "Requer talonário oficial fornecido pela Vigilância Sanitária. Informe o número sequencial impresso no talão."

### Registro do documento
- `registrarDocumento` passa a salvar `metadata.notificacao_numero` e `metadata.uf_emissao` para auditoria e busca futura.

---

## Out of scope
- Integração com SNGPC / e-SUS para envio eletrônico (depende de cadastro junto à ANVISA).
- Importação/geração automática de numeração sequencial pela Vigilância.
- Receita Especial (Talidomida/Misoprostol) — pode ser adicionada num próximo passo seguindo o mesmo padrão.

---

## Arquivos afetados
- **novo**: `src/lib/verificacao-url.ts`
- **edit**: `src/lib/pdf-shared.ts`, `pdf-receita.ts`, `pdf-atestado.ts`, `pdf-sadt.ts`, `pdf-lme.ts`, `pdf-comprovante.ts`
- **edit**: `src/components/verificar/qr-scanner-dialog.tsx`, `src/routes/verificar.tsx` (somente se tiverem referência ao domínio antigo)
- **edit**: `src/components/consultorio/consultorio-dialog.tsx` (form de número da notificação + 2 novos tipos no seletor)

Pronto pra implementar? Responde "continua" que eu sigo direto.
