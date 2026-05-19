## Diagnóstico

Na tela **Exportar e-SUS** (`src/routes/app.exportar-esus.tsx`, linhas 70–82) a consulta de profissionais usa um `.or()` com uma **subquery SQL** dentro do `id.in.(...)`:

```ts
.or(`unidade_id.eq.${unidadeId},id.in.(select profissional_id from profissional_unidades where unidade_id=${unidadeId})`)
```

O PostgREST **não aceita subquery** dentro de `in.(...)` — espera uma lista literal `in.(uuid1,uuid2,...)`. Resultado: o filtro falha silenciosamente e o `<Select>` fica vazio (ou só mostra quem está no `unidade_id` direto — e mesmo assim o `.or` quebra a query inteira). Por isso a enfermeira **Ana Paula Souza**, que foi vinculada via `profissional_unidades` + `unidade_id` direto, não aparece para seleção.

Além disso, hoje o campo começa vazio e o usuário precisa escolher manualmente toda vez — você pediu que a enfermeira responsável da unidade venha pré-selecionada.

## O que vou ajustar

**1. Corrigir a consulta de profissionais da unidade** (`app.exportar-esus.tsx`)

Trocar o `.or()` quebrado por duas consultas simples no Supabase e fazer o merge no cliente:

- `profissionais` com `unidade_id = unidadeId` (titulares da unidade)
- `profissional_unidades` (`profissional_id`) onde `unidade_id = unidadeId`, depois `profissionais` com `id in (lista)` (vínculos secundários)

Unir os dois resultados (sem duplicar por `id`), filtrar `ativo = true`, ordenar por nome. Trazer também o campo `cbo` (já vem) para identificar enfermeiros.

**2. Auto-seleção da enfermeira responsável**

Em um `useEffect` que dispara quando `profissionais` muda e `profissionalId` está vazio:

- Procurar o primeiro profissional cujo `cbo` comece com `2235` (família **Enfermeiro** no CBO 2002 — cobre 223505 generalista, 223565 saúde da família, etc.) **e** tenha `cns` válido (15 dígitos).
- Se houver, `setProfissionalId(esse.id)`.
- Se não houver enfermeiro com CNS, deixar vazio (mantém o aviso atual de "Falta CNS ou CBO").

Isso garante que ao escolher uma unidade o sistema já preenche a enfermeira da equipe, sem o usuário precisar clicar.

**3. Re-disparar a auto-seleção ao trocar de unidade**

O `useEffect` que já existe (linha 90) zera `profissionalId` ao trocar de `unidadeId`. Depois que a nova lista de `profissionais` carrega, o efeito de auto-seleção do passo 2 entra e escolhe a enfermeira da nova unidade.

## Arquivos afetados

- `src/routes/app.exportar-esus.tsx` — única alteração; correção da query + efeito de auto-seleção.

Nenhuma mudança em banco, RLS ou server functions. A enfermeira Ana Paula já está vinculada corretamente; o problema é puramente no filtro do front.
