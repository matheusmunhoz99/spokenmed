## Plano

1. Confirmar o Code Editor como fonte principal
- Manter as alterações diretamente em `cloudflare-worker/src/fiorilli-do.js` e `cloudflare-worker/src/index.js`.
- Não gerar arquivos para download; depois eu só aviso quais arquivos copiar.

2. Corrigir a causa do redirect de sessão
- O log v6 mostra que o iframe abriu corretamente, mas a consulta direta ao `HandleEvent` voltou:
  `window.location=".../ambulatorio.dll/"`
- A sessão ficou sem cookies (`cookies: 0`), então vou ajustar o bootstrap para capturar cookies e dados de sessão também via JavaScript dentro da página/iframe, não apenas pelo jar do navegador.
- Se ainda não houver cookie real, vou criar um cabeçalho de sessão mínimo baseado no que o Fiorilli expõe no iframe, evitando tratar essa resposta curta como “sessão expirada” sem evidência suficiente.

3. Evitar loop que estoura limite do Browser Run
- Quando a primeira consulta voltar só com `window.location` e cookies vazios, não vou relogar imediatamente.
- Em vez disso, o Worker vai devolver um erro diagnóstico controlado com o corpo retornado e estado da sessão, para não abrir um segundo browser e cair em `429 Rate limit exceeded`.

4. Aumentar logs úteis na v7
- Bump para `fiorilli-debug-v7` em `fiorilli-do.js` e `/health` no `index.js`.
- Logar `sId` mascarado, `cookieHeaderLen`, URL usada no `HandleEvent`, `Referer`, e um diagnóstico curto quando o servidor responder redirect.

5. Resultado esperado para teste
- Depois de copiar/deployar v7, você roda:
  - `/health` para confirmar `fiorilli-debug-v7`
  - `/reset`
  - `/cpf?cpf=34691780890&api_key=...`
- O tail deve mostrar se falta cookie, se o `_S_ID` extraído está errado, ou se precisamos mudar o fluxo para fazer a consulta clicando dentro do iframe em vez de POST direto.