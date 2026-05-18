Sistema profissional de emissão de **Notificação de Receita A (amarela)** e **B (azul)** com numeração sequencial backend, hash, assinatura HMAC, QR Code de validação e página pública de verificação com status.

## 1) Banco de dados (migration)

### `receita_contadores`
Garante numeração sequencial sem colisão.
- `uf` text(2), `serie` text — PK composta
- `ultimo_numero` int default 0

### `receitas`
Snapshot completo + status. Imutável após emissão (exceto status).
- `id` uuid pk
- `numero` text unique — `"RJ-A-000238"`
- `serie` text — `'A' | 'B'`
- `uf` text(2), `sequencia` int
- `profissional_id`, `paciente_id`, `agendamento_id`, `unidade_id`
- snapshots: `profissional_nome`, `profissional_crm`, `profissional_uf`, `profissional_cbo`, `paciente_nome`, `paciente_cpf_mask`, `unidade_nome`, `unidade_cnes`
- `medicamentos` jsonb (lista: nome, apresentação, posologia, qtd, qtd_extenso, duração)
- `orientacoes` text
- `validade_dias` int default 30
- `hash_conteudo` text — SHA-256 canônico
- `assinatura` text — HMAC-SHA256 (já existe segredo em `profiles.assinatura_secret`)
- `assinatura_payload_sha`, `assinado_em` timestamptz
- `status` text default `'valida'` check in (`'valida'`,`'cancelada'`,`'utilizada'`,`'expirada'`)
- `emitido_em`, `utilizado_em`, `cancelado_em`, `cancelado_motivo`
- `emitido_por` uuid, `created_at`, `updated_at`

### `receita_logs`
Auditoria por receita (emissão, verificação, cancelamento, uso, reimpressão).
- `id`, `receita_id`, `evento` text, `user_id`, `user_email`, `ip` inet, `user_agent`, `metadata` jsonb, `created_at`

### Função `public.gerar_numero_receita(p_uf, p_serie) returns text`
- `SECURITY DEFINER`
- `INSERT INTO receita_contadores (uf, serie, ultimo_numero) VALUES (p_uf, p_serie, 1) ON CONFLICT (uf, serie) DO UPDATE SET ultimo_numero = receita_contadores.ultimo_numero + 1 RETURNING ultimo_numero`
- Retorna `format('%s-%s-%s', p_uf, p_serie, lpad(seq::text, 6, '0'))`

### Trigger `fn_receita_imutavel` (BEFORE UPDATE)
Bloqueia mudança em `numero, serie, uf, sequencia, hash_conteudo, assinatura, medicamentos, paciente_*, profissional_*`. Só libera `status, utilizado_em, cancelado_em, cancelado_motivo, updated_at`.

### Função `public.verificar_receita(p_numero text)`
Pública (SECURITY DEFINER, sem auth), com rate-limit reaproveitando o padrão de `cidadao_consultar`. Retorna: `numero, serie, status, paciente_mascarado, profissional_nome, profissional_crm, emitido_em, validade_ate, hash_conteudo` + últimos 5 eventos do log. Grava evento `verificada` no log.

### RLS
- `receitas`: SELECT/INSERT por staff na unidade; UPDATE só em `status` pelo emissor ou admin; DELETE nunca.
- `receita_logs`: INSERT autenticado; SELECT por admin + emissor.
- `receita_contadores`: sem acesso direto (só via função).

### Realtime
Não necessário — emissão é síncrona.

## 2) Server functions (`src/lib/receitas.functions.ts`)

- **`emitirReceita(input)`** — middleware `requireSupabaseAuth`:
  1. Valida com Zod (medicamentos não vazios, profissional tem CRM/UF).
  2. RPC `gerar_numero_receita(uf, serie)` → `numero`.
  3. Calcula `hash_conteudo` = SHA-256 do JSON canônico ordenado (`{numero, serie, uf, paciente, profissional, medicamentos, emitido_em}`).
  4. Reutiliza `assinarDocumento` para HMAC.
  5. `INSERT receitas` + `INSERT receita_logs (evento='emitida')` em uma única transação (RPC `sp_emitir_receita` para atomicidade).
  6. Retorna `{ numero, hash_conteudo, assinatura, assinatura_curta, emitido_em, validade_ate, qr_url }`.
- **`cancelarReceita({ numero, motivo })`** — UPDATE status, INSERT log.
- **`marcarReceitaUtilizada({ numero })`** — para uso futuro de farmácia (mantém esqueleto).

## 3) PDF (`src/lib/pdf-receita.ts`)

Visual ajustado para parecer documento médico real brasileiro — limpo, sem fundo amarelo/azul cobrindo a página inteira (causa o "aspecto fake"):

- **Cabeçalho institucional**: faixa horizontal de 48pt na cor da série (amarelo dourado `#C9A227` para A, azul institucional `#1B4F8C` para B). Texto branco: `NOTIFICAÇÃO DE RECEITA — TIPO A` / `B`. Subtítulo: `Portaria SVS/MS 344/98 · Listas A1, A2, A3` / `B1, B2`.
- **Margem lateral fina** colorida (4pt) na cor da série, em vez de fundo full.
- **Bloco "Nº"** topo direito, monoespaçado, fonte `Courier-Bold 18`: `RJ-A-000238`. Abaixo: `Série A · Sequência 000238 · Emitido em 18/05/2026 14:32`.
- Identificação do emitente, paciente, prescrição (com qtd por extenso já existente), comprador, fornecedor — layout tabular Helvetica 9-10 com `border` 0.4 cinza-claro (sem `roundedRect` exagerado).
- **Assinatura**: linha + nome + conselho + texto `Assinatura digital HMAC-SHA256: a3f2…b91c` (8 chars início + 4 chars fim).
- **QR Code** no rodapé esquerdo (110×110pt), apontando para `https://{host}/verificar?p={numero}`. À direita do QR:
  - `Documento eletrônico validável digitalmente`
  - `Lei 14.063/2020 e MP 2.200-2/2001`
  - `Validar em {host}/verificar`
  - `Hash conteúdo: {sha256[:16]}…`
  - `Validade: {n} dias · UF {uf}`
- Marca d'água diagonal sutil `VÁLIDA` cinza 8% em background — substituída por `CANCELADA` vermelha se status mudar (aplica-se em reimpressão).
- Duas vias (1ª retenção farmácia, 2ª paciente) — mantido.

A função `gerarReceitaPdf` passa a aceitar `{ numero, hash, assinatura, emitido_em, validade_ate, qr_url }` já preparados em vez de gerar.

## 4) Diálogo do consultório (`consultorio-dialog.tsx`)

- Remover inputs manuais `notifNum` / `notifUf` (substituídos pelo backend).
- Mostrar aviso destacado:
  > "O número da notificação será gerado automaticamente pelo sistema (`RJ-A-000238`) e registrado no banco com hash e assinatura digital. Imutável após emissão."
- Botão `Imprimir receita` agora chama `emitirReceita` → recebe `numero` → chama `gerarReceitaPdf` com payload completo → abre PDF.
- Em caso de erro (sem CRM, sem UF no perfil) mostra toast com link "Meu Perfil".

## 5) Página de verificação (`src/routes/verificar.tsx`)

- Aceita tanto protocolo antigo quanto formato `RJ-A-000238`.
- Para receitas, chama `verificar_receita` (não `cidadao_consultar`).
- Badge grande de status:
  - **Válida** — verde, ícone `ShieldCheck`
  - **Cancelada** — vermelho, mostra motivo + data
  - **Utilizada** — âmbar, mostra data
  - **Expirada** — cinza
- Mostra: número, série, médico + CRM, paciente mascarado (primeiro nome + iniciais), emitido em, validade até, hash (16 chars), assinatura curta.
- Lista os últimos 5 eventos de auditoria (data + evento + IP mascarado).
- Botão "Reportar suspeita de fraude" (mailto ou simple insert em log com `evento='reportada'`).

## 6) Itens do pedido tratados como opcionais

- **`receita_assinaturas`** — não criado como tabela separada (a assinatura HMAC vive em `receitas.assinatura` + `assinado_em`, já atomicamente vinculada). Tabela separada só faria sentido para múltiplas assinaturas (co-assinatura). Posso adicionar se quiser.
- **`receita_lotes`** — para talonário físico de contingência (Vigilância Sanitária). Não vou criar agora; menciono no schema como TODO. Posso adicionar se quiser.

## Arquivos tocados

- `supabase/migrations/{ts}_receitas.sql` (novo)
- `src/lib/receitas.functions.ts` (novo)
- `src/lib/pdf-receita.ts` (refatorado para receber numero+hash+assinatura prontos)
- `src/components/consultorio/consultorio-dialog.tsx` (remove inputs manuais, chama `emitirReceita`)
- `src/routes/verificar.tsx` (status, eventos, formato RJ-A-)
- `src/integrations/supabase/types.ts` (regenerado pela migration)

Sem mudanças em autenticação. RLS rigoroso. Tabela imutável por trigger.