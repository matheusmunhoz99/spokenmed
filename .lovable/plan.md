# Corrigir o POST de consulta no worker (CPF não encontrado)

## Diagnóstico

Comparando o `Ajax=1...` real do sistema com o que o worker está enviando hoje (`cloudflare-worker/src/index.js`, função `doPostConsulta`, linhas 145–158), há 3 diferenças que fazem o Fiorilli devolver tela vazia (e o worker classificar como `cpf_nao_encontrado`):

| Campo | Sistema real (funciona) | Worker hoje (falha) |
|---|---|---|
| `_fp_` | `%26O1162%3D%25020%2502%2502346.917.808-90` (carrega o CPF dentro) | vazio |
| `O1162` (separado) | **não existe** — vai dentro do `_fp_` | enviado como parâmetro próprio com prefixo `%021%02%02` |
| Prefixo do valor | `%020%02%02` (zero) — depois de um decode | `%021%02%02` (um) |
| `_seq_` | hexadecimal (`3f`) | decimal (`63`) |
| CPF | enviado **formatado com pontos e traço** literal | passa por `encodeURIComponent` |

Ou seja, o uniGUI espera o CPF empacotado dentro do `_fp_` como um "form payload" duplo-encodado, com `%020` (não `%021`) na frente, e o `_seq_` em hex. Hoje a request chega "vazia" pro componente O1162 → ele responde sem dados → `cpf_nao_encontrado`.

## Alterações em `cloudflare-worker/src/index.js`

### 1. Montar o `_fp_` corretamente (linhas 145–158)

Substituir:
```js
const o1162 = `%021%02%02${encodeURIComponent(cpfFmt)}`;
const body =
  `Ajax=1&IsEvent=1&Obj=O117A&Evt=click&this=O117A` +
  `&_S_ID=${encodeURIComponent(session.sId)}` +
  `&_fp_=` +
  `&O1162=${o1162}` +
  `&_seq_=${seq}` +
  `&_uo_=O112A`;
```
por:
```js
// O _fp_ é o "form payload" do uniGUI: já vem URL-encodado uma vez,
// e o valor de O1162 dentro dele é encodado de novo.
// Real: _fp_=%26O1162%3D%25020%2502%2502<CPF com pontos e traço>
const fp = `%26O1162%3D%25020%2502%2502${cpfFmt}`; // SEM encodeURIComponent no CPF
const seqHex = seq.toString(16);
const body =
  `Ajax=1&IsEvent=1&Obj=O117A&Evt=click&this=O117A` +
  `&_S_ID=${encodeURIComponent(session.sId)}` +
  `&_fp_=${fp}` +
  `&_seq_=${seqHex}` +
  `&_uo_=O112A`;
```

### 2. (Opcional) Manter o parse do grid, mas não exigir `nome`

O response do POST que você colou agora já traz endereço + CNS via `setText`. O `nome / sexo / nascimento / mãe / pai` vinham da chamada de grid (`O11B2`). Manter o GET de grid como está — se vier vazio, seguimos só com os `setText`. A condição `hasAnything` (linha 284) já cobre isso. Nenhuma mudança aqui.

### 3. Log do body enviado (debug temporário)

Logo antes do `fetch(HANDLE_EVENT, ...)` em ~linha 163, adicionar:
```js
console.log("[cpf] POST body", body);
```
para a gente conferir no `wrangler tail` que o body bate byte-a-byte com o real.

## Como você testa depois do deploy

1. `cd cloudflare-worker && wrangler deploy`
2. Confirmar sessão: `GET /session?api_key=Xofome23@` → `hasSession:true`
3. `GET https://spokenmed.meyssiner.workers.dev/cpf?cpf=34691780890&api_key=Xofome23@`
   - Esperado: `{ ok:true, dados:{ logradouro:"RUA RIO NEGRO", numero:"183", bairro:"COHAB", cidade:"VOTUPORANGA", uf:"SP", cns:"705008830546157", ... } }`
4. Se ainda voltar vazio, rodar `wrangler tail` em paralelo, repetir o request e me mandar o `[cpf] POST body` + `[cpf] POST consulta preview`.

## Pendência confirmada com você

Não vou mexer no app Lovable — só no worker. Posso aplicar essas alterações?
