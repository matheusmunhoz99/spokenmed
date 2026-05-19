## Problema

No PWA mobile, a barra de ações "Salvar" + "Finalizar e enviar ao e-SUS APS" usa `position: fixed bottom-0`, o que faz ela:
- pular para o meio da tela quando o teclado virtual abre/fecha (iOS/Android PWA)
- ficar sobreposta ao conteúdo enquanto o usuário rola o formulário SOAP

## Solução

Trocar a barra **fixa** por uma barra **sticky dentro do scroll do formulário** — ela acompanha o conteúdo e só "gruda" no fim quando o usuário chega no final do SOAP. Não flutua, não briga com o teclado, não tampa campos.

## Mudanças (apenas em `src/components/consultorio/consultorio-dialog.tsx`)

1. **Remover** o bloco `<div className="fixed inset-x-0 bottom-0 z-50 ... sm:hidden">` (linhas 922–942) que renderiza a barra fixa.
2. **Remover** o spacer `<div className="h-24 sm:hidden" />` da linha 917 (não precisa mais reservar espaço para barra fixa).
3. **Adicionar**, no fim do `<main>` (depois do `</Tabs>`, antes do fechamento), uma barra sticky equivalente:
   ```tsx
   <div className="sticky bottom-0 z-10 -mx-3 mt-6 border-t bg-card/95 px-3 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
     <div className="flex items-center gap-2">
       <Button variant="outline" onClick={salvarRascunhoManual} className="h-12 gap-1.5">
         <Save className="h-4 w-4" /> Salvar
       </Button>
       <Button onClick={finalizar} size="lg" className="h-12 flex-1 gap-2 bg-gradient-to-r from-primary to-primary/85 text-base font-semibold shadow-lg shadow-primary/25">
         <Send className="h-5 w-5" /> Finalizar e enviar ao e-SUS APS
       </Button>
     </div>
   </div>
   ```
4. Garantir que o container `<main>` que faz scroll tenha `overflow-y-auto` (já tem) — `sticky` só funciona dentro de um ancestral que rola; nenhum ajuste extra previsto, mas verifico em implementação.

## Por que sticky em vez de fixed

- `sticky` é parte do fluxo do layout → nunca cobre conteúdo arbitrariamente.
- Não é afetado pelo viewport visual / teclado virtual do iOS PWA.
- `pb-[max(...,env(safe-area-inset-bottom))]` mantém respiração para iPhones com home indicator.
- Só renderiza em mobile (`sm:hidden`); desktop continua usando os botões no header (linhas 543–551), sem mudanças.

## Escopo

Mudança puramente de UI/CSS em um arquivo. Sem alterar lógica de salvar, finalizar, ou exportação e-SUS.