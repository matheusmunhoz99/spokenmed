## Objetivo
Capturar TUDO que acontece entre o navegador e `saudeteresopolis.oppcloud.com.br/sis/` durante login + busca de CPF, pra eu conseguir reproduzir esse fluxo com `fetch` puro no Worker (sem Puppeteer, sem Browser Rendering, 100% grátis).

## Como vai funcionar

1. Você abre `https://saudeteresopolis.oppcloud.com.br/sis/` no Chrome
2. Abre o DevTools (F12) → aba **Console**
3. Cola o script que eu vou te entregar e aperta Enter
4. **Faz o login normalmente** (usuário + senha)
5. **Busca um CPF** como faria normalmente
6. Volta no console e digita `__dump()` → ele baixa um arquivo `.json` com tudo capturado
7. Você me envia esse `.json` (anexa aqui no chat)

## O que o script vai capturar

Pra cada requisição (fetch + XHR + form submit):
- URL completa, método, status
- **Headers de request** (cookies, content-type, x-requested-with, etc)
- **Headers de response** (Set-Cookie, redirects)
- **Body de request** (payload do login, do HandleEvent, viewstate, etc)
- **Body de response** (HTML retornado, JSON, etc — limitado a 200KB por resposta pra não explodir)
- Timestamps e ordem

Não captura: senha em texto será mascarada antes de salvar (te pergunto o campo). Aliás — melhor: o script **não** mascara nada, e antes de me mandar você abre o JSON e troca sua senha por `***`. Mais seguro.

## Por que isso resolve

Com o JSON em mãos, eu consigo ver exatamente:
- Qual URL recebe o POST do login e com que campos
- Qual cookie/token é setado e onde ele aparece nas próximas requests
- Qual endpoint busca o CPF, com que payload e que JSON/HTML volta
- Se tem CSRF token, viewstate (ASP.NET), challenge, etc

Aí reescrevo o `opp-client.server.ts` usando só `fetch` nativo do Worker — sem browser, sem rate limit, sem custo.

## Plano de implementação

1. Eu te entrego o script de captura (pra colar no console)
2. Você roda, faz login + busca CPF, gera o dump, me manda
3. Eu analiso o JSON e reescrevo `src/lib/opp-client.server.ts` com fetch puro
4. Removo as dependências de Puppeteer/Browser Rendering do `wrangler.jsonc`
5. Removo o Durable Object `FIORILLI_DO` (não precisa mais cachear sessão de browser; vou cachear só os cookies HTTP, que é leve)
6. Você roda `npx wrangler deploy` e testa o endpoint `/cpf?cpf=...` de novo

## Detalhes técnicos

- Script usa monkey-patch em `window.fetch` e `XMLHttpRequest.prototype.open/send` pra capturar tudo
- Também intercepta `HTMLFormElement.prototype.submit` e o evento `submit` pra pegar logins via form tradicional
- Armazena tudo em `window.__captured = []`
- `__dump()` faz `JSON.stringify` e dispara download via `<a download>`
- Resposta de cada request é clonada (`.clone()`) pra ler o body sem quebrar a página

## Riscos / limitações

- Se o site usar **WebSocket** ou **Server-Sent Events** pro login, o script padrão não pega — me avisa que adiciono interceptor
- Se a senha aparecer no body de request, ela vai estar no JSON — **edita antes de me mandar**
- Bodies acima de 200KB ficam truncados (raramente importa, mas avisa se for o caso)

Aprova que eu te mando o script?