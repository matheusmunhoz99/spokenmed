# Exportação e-SUS: bypass de erros + correção inline

## 1. Flag "Gerar mesmo com erros"

Na tela `/app/exportar-esus`, no passo 2 (resultado da pré-validação), quando houver `preview.erros.length > 0`:

- Adicionar um `Checkbox` **"Estou ciente dos erros e quero gerar o lote mesmo assim (modo teste)"** logo acima do botão "Gerar".
- Novo estado local: `cienteErros: boolean` (reseta sempre que `preview` muda — pra não ficar marcado de uma rodada pra outra).
- Mudar `podeGerar` para: `preview && totalPronto > 0 && (preview.erros.length === 0 || cienteErros)`.
- Quando gerar com `cienteErros = true`:
  - Trocar cor/ícone do botão pra `variant="destructive"` com label `"Gerar mesmo com erros (teste)"`.
  - Mostrar um `Alert` amarelo curto avisando que o PEC provavelmente vai rejeitar o `.esus`.
  - Passar `ignorarErros: true` no payload do `registrarFn` / loop de unidades, e gravar no `metadados` do lote (campo `validacao.ignorado: true` e `validacao.erros: N`) pra ficar rastreável no histórico.
- No back-end (`registrarLoteExportacao` em `src/lib/esus-export.functions.ts`), aceitar o flag e **não revalidar / bloquear** quando `ignorarErros = true`. A geração do `.zip`/`.esus` segue normal — só pula o "abort se erro".
- No histórico (passo 3), badge extra `⚠ ignorado` quando `metadados.validacao.ignorado` for true.

## 2. Modal inline pra corrigir pendências

Hoje o botão "Abrir" navega pra fora da tela. Trocar por um modal (`Dialog` full-screen `sm:max-w-5xl h-[85vh]`) que renderiza o destino sem sair da exportação.

Abordagem **pragmática (MVP)**: usar `<iframe>` apontando pra `e.rota.to` (com params/search já serializados).

- Novo componente `CorrigirPendenciaDialog` em `src/components/exportacao/CorrigirPendenciaDialog.tsx`:
  - Props: `open`, `onOpenChange`, `rota` (`{ to, params?, search? }`), `descricao`, `onRevalidar`.
  - Renderiza `<iframe src={resolveUrl(rota)} className="w-full h-full border-0" />`.
  - Header com a descrição do erro e botões: **"Re-validar agora"** (fecha modal + chama `validarFn` novamente) e **"Abrir em nova aba"** (fallback).
  - `resolveUrl` monta a URL final substituindo `$param` por `params[param]` e fazendo `?key=value` do `search`.
- Na tabela de erros, trocar o botão atual por:
  ```tsx
  <button onClick={() => setCorrigindo({ rota: e.rota, descricao: e.descricao })}>
    Corrigir <Pencil className="h-3 w-3" />
  </button>
  ```
- Estado `corrigindo` no componente da página + `<CorrigirPendenciaDialog open={!!corrigindo} ... />`.
- Ao fechar, oferecer **revalidação automática opcional**: toast com botão "Re-validar".

### Por que iframe (e não embutir o form)?
Os destinos cobrem 5 telas diferentes (`/app/configuracoes`, `/app/profissionais`, `/app/pacientes?abrir=`, `/app/domicilios/$id`, `/app/visitas`), cada uma com formulários grandes. Refatorar todas em "modo modal" é trabalho longo e fora do escopo do pedido ("só pros testes ficarem mais fáceis agora"). Iframe entrega o resultado UX que você quer (editar sem sair da exportação) em 1 componente.

Limitações conhecidas: iframe abre a tela inteira do app com sidebar. Pra mitigar, aceitar `?embed=1` na URL e no `__root` esconder header/sidebar quando esse param estiver presente — opcional, mas deixa o modal muito mais limpo. **Vou incluir esse polish.**

## 3. Arquivos afetados

- `src/routes/app.exportar-esus.tsx` — checkbox, estado `cienteErros` e `corrigindo`, badge "ignorado" no histórico, troca do botão "Abrir" → "Corrigir".
- `src/lib/esus-export.functions.ts` — aceitar `ignorarErros` em `registrarLoteExportacao` (e na função batch de "todas as unidades") e gravar `metadados.validacao.ignorado`.
- `src/components/exportacao/CorrigirPendenciaDialog.tsx` — novo.
- `src/routes/__root.tsx` (ou layout do `_app`) — esconder chrome quando `search.embed === "1"`.

Sem mudança de banco.

## 4. Fora de escopo

- Reescrever cada cadastro como componente embutível (fica pra depois, se você quiser substituir o iframe).
- Validar se o PEC aceita lotes com erros — você assume o risco ao marcar o checkbox.
