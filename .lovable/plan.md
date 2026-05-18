# Plano: SpokenMED como APK Android (.apk / .aab)

Sim, dá pra fazer — e fica praticamente idêntico ao app nativo. O caminho certo pra um PWA já pronto como o seu é **Trusted Web Activity (TWA)** via **Bubblewrap** (ferramenta oficial do Google). O APK abre direto no `https://spokenmed.lovable.app` (ou no domínio custom `spokenmed.oppcloud.com.br`) **sem barra de navegador, sem "aberto no Chrome"**, com ícone, splash screen e tela cheia — parece 100% nativo.

## Por que TWA (e não Capacitor / WebView / Cordova)

- **TWA** = Chrome roda seu site em tela cheia dentro do APK. Atualizações do site = atualizações do app, sem republicar APK. Notificações push, câmera, geolocalização, PWA install — tudo funciona.
- **Capacitor/Cordova** = embrulhar num WebView, mais trabalho, performance pior, e você teria que manter código nativo.
- TWA é o que o próprio Google recomenda pra PWAs em produção (Twitter Lite, Starbucks, etc. usam).

## O que vou entregar

1. **`SpokenMED.apk`** — instalável direto (modo debug / sideload). Você abre, instala, usa.
2. **`SpokenMED-release.aab`** — bundle assinado pronto pra Play Store (caso queira publicar depois).
3. **`assetlinks.json`** — arquivo de verificação que precisa ficar em `https://spokenmed.lovable.app/.well-known/assetlinks.json` pra remover a barra de URL do Chrome. Vou adicionar isso no `public/.well-known/` do projeto.
4. **Keystore** (`spokenmed.keystore`) + senha — guarde, é o que assina o app pra sempre.
5. **LEIA-ME** com como instalar, atualizar e republicar.

## Como vai funcionar (técnico)

```text
[Android APK / TWA]
        │
        │ abre em tela cheia
        ▼
https://spokenmed.lovable.app  ←─ seu PWA atual (sem mudanças)
        │
        ▼
/.well-known/assetlinks.json   ←─ prova ao Android que o site é seu
```

- **Build chain**: Bubblewrap CLI → gera projeto Android Gradle → compila com JDK 17 + Android SDK 34 → assina com keystore → APK + AAB.
- **Manifest source**: o `public/manifest.webmanifest` que você já tem (name, icons, theme_color, start_url=`/app`). Bubblewrap lê direto dele.
- **Ícones**: usar os de `public/icons/icon-512.png` (já existem). Gero também adaptive icon (foreground + background) pro Android 8+.
- **Splash screen**: cor `#fafbfc` (claro) / `#0c2340` (escuro) — já estão no manifest.
- **Package name**: `app.lovable.spokenmed` (ou o que você preferir — uma vez publicado na Play Store **não muda mais**).
- **Domínio alvo**: vou usar `spokenmed.oppcloud.com.br` (seu domínio custom) por ser mais estável que `*.lovable.app`. Confirma na pergunta abaixo se prefere o `.lovable.app`.

## Passo de verificação (Digital Asset Links)

Pra Chrome esconder a barra de URL no TWA, o domínio precisa servir um JSON apontando pro fingerprint do seu keystore. Eu:

1. Gero o keystore.
2. Extraio o SHA-256 fingerprint.
3. Crio `public/.well-known/assetlinks.json` com esse fingerprint.
4. Você publica o projeto (`Publish`) pra o arquivo ficar em produção.
5. Instala o APK — barra desaparece, vira app nativo de verdade.

Se pular o passo 4, o app funciona mas mostra uma barrinha "powered by Chrome" no topo. Sem fim do mundo, mas feio.

## Limitações honestas

- **Precisa publicar o site** antes do APK ficar "limpo" (sem barra). Enquanto não publicar, instala e roda, só com a barrinha.
- **iOS não tem equivalente** — TWA é só Android. Pra iPhone, o caminho é "Adicionar à Tela de Início" do Safari (que seu PWA já faz, com o componente `InstallPwaPrompt`).
- **Tamanho**: ~3-5 MB (TWA é leve, é praticamente um atalho turbinado).
- **Build roda no sandbox** (Linux com JDK + Android SDK via nix). Demora ~3-5 min na primeira vez.

## Perguntas pra você responder antes de eu construir

1. **Qual domínio o app deve abrir?**
   - `spokenmed.oppcloud.com.br` (recomendado — seu domínio próprio, estável)
   - `spokenmed.lovable.app` (URL Lovable publicada)
2. **Package name** (não muda mais depois de publicar na Play Store):
   - `br.com.oppcloud.spokenmed` (recomendado, padrão BR)
   - `app.lovable.spokenmed`
   - Outro (você escolhe)
3. **Senha do keystore** — use a mesma `Xofome23@` que você já usou no .exe, ou outra? (Importante: se perder, não dá pra atualizar o app na Play Store nunca mais.)
4. **Publicar na Play Store agora** ou só APK pra sideload? (APK só pra você instalar é mais rápido — pula a parte de screenshots, descrição, conta de dev de $25 USD, etc.)

Assim que responder, gero o APK e te mando o link pra baixar.
