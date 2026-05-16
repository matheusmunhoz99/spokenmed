Plano para deixar isso bem mais fácil:

1. Criar uma página no próprio Worker em `/capture`
   - Você abre `https://spokenmed.meyssiner.workers.dev/capture` no navegador.
   - Cola ali o “Copy as cURL” inteiro do DevTools.
   - Digita a API key.
   - Clica em “Atualizar sessão”.
   - A página extrai `_s_id`, `unisessionid` e cookies automaticamente e chama `/session/update`.

2. Manter também um modo manual bem simples
   - Adicionar uma rota tipo `/session/set?api_key=...&s_id=...`.
   - Se o cURL continuar dando trabalho, você só copia o valor do header `_s_id` no DevTools e abre esse link.
   - Sem PowerShell, sem `node`, sem arquivo `req.txt`.

3. Melhorar os erros
   - Se não achar `_s_id`, a página vai mostrar exatamente o que faltou e onde copiar.
   - Se atualizar certo, mostra “sessão atualizada” e já oferece um link para testar `/session`.

Depois disso o passo a passo fica:

```text
1. Entrar no sistema da prefeitura pelo Chrome
2. DevTools > Network > clicar em HandleEvent
3. Copy > Copy as cURL (cmd)
4. Abrir /capture no Worker
5. Colar, colocar API key e clicar atualizar
```

Isso substitui totalmente o uso do `capture-session.mjs` local.