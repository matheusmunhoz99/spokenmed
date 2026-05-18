# Plano — Scanner QR em /verificar + checagem final

## Contexto importante (boa notícia)

A leitura pela **câmera nativa** do celular **já funciona hoje**:
- O QR impresso nos PDFs aponta para `https://spokenmed.lovable.app/verificar?p=PROTOCOLO`.
- A página `/verificar` já tem `useEffect` que, ao detectar `?p=` na URL, **preenche o campo e valida automaticamente** (chama `verificar_documento`).
- Ou seja: apontou a câmera do iPhone/Android → toca no link → abre o site **já validado**. Sem precisar digitar nada.

O que falta é o **scanner dentro da própria página** (botão "Escanear QR") para quem está no portal e quer validar um documento físico sem digitar o protocolo.

## 1. Adicionar scanner por câmera em `/verificar`

**Biblioteca:** `@zxing/browser` (~50 kB, sem dependências nativas, funciona em Worker/SSR pois só roda no cliente).
- Alternativa considerada: `html5-qrcode` (mais pesada, UI própria que conflita com o design system). Descartada.

**UX:**
- Botão **"Escanear QR"** ao lado do botão "Verificar" (ícone `Camera` do lucide).
- No mobile, o botão aparece em destaque acima do input.
- Ao tocar: abre um `Dialog` em tela cheia com o vídeo da câmera traseira (`facingMode: "environment"`).
- Overlay com moldura/cantos animados indicando a área de leitura.
- Ao detectar um QR:
  1. Se for URL do próprio domínio com `?p=`, extrai só o protocolo.
  2. Preenche o input, fecha o dialog, dispara `consultar()` automaticamente.
  3. Vibra o aparelho (`navigator.vibrate(80)`) como feedback.
- Botão "Cancelar" e tratamento de permissão negada (mensagem clara: "Permita acesso à câmera nas configurações do navegador").
- HTTPS já garantido pelo domínio Lovable, então `getUserMedia` funciona.

**Arquivos:**
- `bun add @zxing/browser @zxing/library`
- Criar `src/components/verificar/qr-scanner-dialog.tsx` (componente isolado, lazy-loaded com `React.lazy` para não pesar no bundle de quem só digita).
- Editar `src/routes/verificar.tsx`: importar lazy, adicionar botão e estado `scannerOpen`.

## 2. Pequenas melhorias de robustez no /verificar

- Normalizar protocolo colado com URL completa: se o usuário colar `https://.../verificar?p=ABC`, extrair `ABC` automaticamente.
- Adicionar `inputMode="text"` + `autoCapitalize="characters"` no input.
- Botão "Copiar protocolo" no card de resultado.

## 3. Varredura de bugs antes do lançamento

Vou verificar (sem alterar lógica de negócio):
- `bun run build` limpa (sem erros TS / imports quebrados).
- Console e network do preview sem erros.
- Rota `/verificar` carrega anônima (sem exigir login) — confirmar que não está atrás do `_authenticated`.
- Linter do Supabase (`supabase--linter`) sem alertas novos após a migração de `documentos_emitidos`.
- Smoke test no preview: gerar um PDF → ler QR → validar.

Se encontrar bug, corrijo no mesmo loop e reporto.

## 4. APK — precisa regerar?

**Não.** O projeto **não tem app nativo / Capacitor**. A pasta `spokenmed-agent/` é um agente Python desktop (scripts `.bat`, `.vbs`, `agent.py`) — não é Android.

A verificação é 100% web: o QR aponta para uma URL pública, qualquer leitor de QR nativo (câmera do iOS/Android, Google Lens, etc.) já abre o navegador na página validada. Não há APK para reconstruir.

Se no futuro você quiser empacotar como app (Capacitor/PWA), aí sim seria preciso build separado — mas hoje **não é necessário para essa entrega**.

## Detalhes técnicos

- `@zxing/browser` expõe `BrowserMultiFormatReader.decodeFromVideoDevice(deviceId|undefined, videoEl, callback)`. Passando `undefined` ele escolhe a câmera padrão; usamos `getUserMedia({ video: { facingMode: { ideal: "environment" } } })` antes para forçar a traseira no mobile.
- Cleanup obrigatório: `reader.reset()` + `stream.getTracks().forEach(t => t.stop())` ao fechar o dialog, senão a luz da câmera fica ligada.
- Lazy import: `const QrScannerDialog = lazy(() => import("@/components/verificar/qr-scanner-dialog"))` + `<Suspense>` para não carregar ZXing na visita inicial.
- Sem mudanças no backend, RLS, ou nos PDFs já gerados.
