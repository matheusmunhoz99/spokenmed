# spokenmed Worker (Fiorilli/OPP CadSUS bridge)

Worker que faz login no sistema Fiorilli/OPP via Browser Rendering (Puppeteer)
e expõe `GET /cpf?cpf=...` em JSON pro app Lovable consumir.

## Setup

1. Copie esses arquivos pro seu repo do worker `spokenmed`:
   - `src/index.js`
   - `src/fiorilli-do.js`
   - `wrangler.jsonc`
   - `package.json` (mescle com o seu se quiser)

2. Instale deps:
   ```bash
   bun install     # ou npm install
   ```

3. Configure secrets (dashboard CF → Workers → spokenmed → Settings → Variables and Secrets):
   - `OPP_BASE_URL` — ex: `https://oppcloud.com.br`
   - `OPP_USERNAME` — seu usuário
   - `OPP_PASSWORD` — sua senha
   - `API_KEY` — uma string aleatória forte; ex: `openssl rand -hex 32`

4. Bindings em `wrangler.jsonc` já configurados:
   - `BROWSER` (Browser Rendering — já habilitado)
   - `FIORILLI_DO` (Durable Object singleton)

5. Deploy:
   ```bash
   wrangler deploy
   ```

## Teste rápido

```bash
# health (sem auth)
curl https://spokenmed.meyssiner.workers.dev/health

# lookup (com api key)
curl -H "x-api-key: SUA_API_KEY" \
  "https://spokenmed.meyssiner.workers.dev/cpf?cpf=12345678900"
```

Resposta esperada:
```json
{
  "ok": true,
  "dados": {
    "nome": "FULANO DE TAL",
    "logradouro": "RUA X",
    "numero": "123",
    "bairro": "CENTRO",
    "cidade": "CIDADE",
    "uf": "MG",
    "cns": "...",
    "cns_secundario": null,
    "telefone": "(31) 99999-9999"
  }
}
```
