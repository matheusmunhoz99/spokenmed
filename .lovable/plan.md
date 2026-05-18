# Corrigir crash do APK SpokenMED v1.4.0

## Diagnóstico

O log do dispositivo mostra exatamente o problema:

```
java.lang.RuntimeException: Unable to instantiate application
br.com.oppcloud.spokenmed.Application
Caused by: java.lang.ClassNotFoundException:
Didn't find class "br.com.oppcloud.spokenmed.Application"
```

No build anterior (v1.4.0), o `AndroidManifest.xml` foi gerado com o atributo
`android:name=".Application"` na tag `<application>`, mas **a classe Java
correspondente não foi incluída no APK** (não existe `Application.java` no
projeto, e o build não compilou nenhuma classe customizada de Application).
Resultado: o Android tenta instanciar `br.com.oppcloud.spokenmed.Application`
no boot e crasha antes de qualquer tela abrir.

Não é problema do TWA, do LiveKit, das permissões nem do assetlinks — é só
um manifest apontando para uma classe inexistente.

## Correção

Regerar o APK como **v1.4.1** (versionCode 6), mantendo absolutamente
**tudo igual** ao v1.4.0 que funcionou visualmente (mesmo package, mesma
keystore, mesmas permissões de câmera/áudio, mesmo ícone, mesma URL), e
apenas:

1. **Remover** o atributo `android:name=".Application"` da tag
   `<application>` no `AndroidManifest.xml`. Sem esse atributo o Android
   usa a `android.app.Application` padrão, que é o que o TWA precisa.
   (Alternativa equivalente: criar a classe `Application.java` vazia
   estendendo `android.app.Application`. Optamos pela remoção por ser
   mais simples e ter o mesmo efeito prático.)
2. **Bump de versão**: `versionName 1.4.1`, `versionCode 6`.
3. **Assinar** com a mesma `spokenmed.keystore` (SHA-256 já registrada no
   `assetlinks.json`), para preservar o modo TWA fullscreen sem barras
   do navegador.
4. Manter no manifest as permissões já presentes:
   `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `INTERNET`,
   `ACCESS_NETWORK_STATE`.
5. Manter o mesmo `applicationId` `br.com.oppcloud.spokenmed` (bate com
   `public/.well-known/assetlinks.json`).

## Entrega

Gerar em `/mnt/documents/spokenmed-android/`:

- `SpokenMED.apk` (v1.4.1, assinado, instalável)
- `SpokenMED-release.aab` (para Play Store, opcional)
- `LEIA-ME.txt` atualizado explicando o fix
- Repacotar como `SpokenMED-Android-v6.zip`

## Como testar

1. **Desinstalar** o APK v1.4.0 atual (que está em crash loop).
2. Instalar o `SpokenMED.apk` v1.4.1.
3. Abrir — deve carregar direto no app, sem tela de erro e sem barra de URL.
4. Abrir uma teleconsulta para confirmar que câmera e microfone do LiveKit
   continuam funcionando.

## Sem mudanças no app web

Nenhum arquivo do projeto Lovable (frontend, server functions, LiveKit,
Supabase) é alterado — o bug é 100% no empacotamento Android.
