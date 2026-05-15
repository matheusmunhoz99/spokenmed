## Diagnóstico encontrado

O erro atual não é senha nem CPF: o servidor está retornando `browser_indisponivel` porque o binding `BROWSER` não está chegando no runtime publicado. O log real mostra:

```text
[opp] lookup failed {"code":"browser_indisponivel","msg":"Cloudflare Browser Rendering binding (BROWSER) não disponível neste runtime"}
```

Ou seja: o código para antes de abrir o navegador e antes de tentar login no Fiorilli.

## Plano de correção

1. **Parar de depender de `globalThis.__CF_ENV` para o Browser Rendering**
   - Ajustar o wrapper do servidor para propagar o `env` de forma segura por request.
   - Garantir que o server function consiga acessar `env.BROWSER` no momento da chamada.

2. **Adicionar diagnóstico visível e preciso no fluxo CPF**
   - Logar se o binding `BROWSER` existe.
   - Logar início do login Fiorilli, carregamento de `/sis/`, preenchimento do usuário, tentativa de submit e URL final.
   - Sem expor senha nos logs.

3. **Manter a arquitetura híbrida pedida**
   - Browser Rendering somente para login inicial/renovação.
   - Consulta CPF via HTTP puro no `HandleEvent`.
   - Ignorar timers.
   - Incrementar `seq` serializado.
   - Parser via `setText/stateValue/originalValue`.

4. **Melhorar fallback quando Browser Rendering realmente não estiver disponível**
   - Se o ambiente publicado continuar sem `BROWSER`, retornar mensagem técnica clara: `Binding BROWSER ausente no Worker publicado`.
   - Isso diferencia erro de ambiente de erro de credencial/login.

5. **Verificar após implementar**
   - Consultar os logs do servidor novamente.
   - Confirmar se passou de `puppeteer.binding` para `puppeteer.launch`/`puppeteer.login`.
   - Se depois disso falhar, o próximo erro já será o motivo real: login rejeitado, seletor mudou, `_S_ID` não extraído, timeout ou resposta Fiorilli sem `setText`.

## Arquivos que serão ajustados

- `src/server.ts`
- `src/lib/opp-client.server.ts`
- `src/lib/cadsus-diag.functions.ts`
- se necessário, `wrangler.jsonc` para compatibilidade correta do binding