// Cloudflare Worker: spokenmed
// Consulta CPF no Fiorilli/uniGUI via HTTP puro (sem Puppeteer / Browser / DO).
//
// Rotas:
//   GET  /health                         → { ok: true }
//   POST /session/update                 → atualiza cookies + _S_ID (JSON)
//   GET  /session                        → mostra estado da sessão (mascarado)
//   GET  /cpf?cpf=12345678900            → { ok, dados } | { ok:false, error }
//
// Auth (header x-api-key OU query ?api_key=) usando env.API_KEY em todas
// as rotas exceto /health.
//
// Persistência: módulo em memória do isolate (volátil). Se o isolate reciclar,
// basta re-postar /session/update com os valores atualizados.

const BUILD = "fiorilli-http-v2";
const BASE = "https://saudeteresopolis.oppcloud.com.br";
const HANDLE_EVENT = `${BASE}/ambulatorio/ambulatorio.dll/HandleEvent`;
const REFERER = `${BASE}/ambulatorio/ambulatorio.dll/`;
const TIMEOUT_MS = 30_000;

// Persistência em Workers KV (binding SESSION_KV).
// Mantemos também um cache per-isolate só pra evitar 2 reads na mesma request.
const SESSION_KEY = "current";
const EMPTY_SESSION = { cookies: "", sId: "", seq: 1, updatedAt: 0 };
let SESSION = { ...EMPTY_SESSION };

async function loadSession(env) {
  if (!env.SESSION_KV) {
    // fallback (dev sem binding): usa memória
    return SESSION;
  }
  const raw = await env.SESSION_KV.get(SESSION_KEY);
  if (!raw) return { ...EMPTY_SESSION };
  try {
    const parsed = JSON.parse(raw);
    return { ...EMPTY_SESSION, ...parsed };
  } catch {
    return { ...EMPTY_SESSION };
  }
}

async function saveSession(env, session) {
  SESSION = session;
  if (env.SESSION_KV) {
    await env.SESSION_KV.put(SESSION_KEY, JSON.stringify(session));
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "x-api-key,content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });
}

function authOk(request, url, env) {
  if (!env.API_KEY) return false;
  const k = request.headers.get("x-api-key") || url.searchParams.get("api_key") || "";
  return k === env.API_KEY;
}

function mask(s) {
  if (!s) return "";
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`;
}

function formatCpf(cpf) {
  const d = cpf.replace(/\D/g, "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function extract(re, text) {
  const m = text.match(re);
  return m ? m[1] : "";
}

function unescapeUni(s) {
  // uniGUI escapa caracteres com \xNN e \uNNNN dentro de strings JS
  try {
    return JSON.parse(`"${s.replace(/"/g, '\\"')}"`);
  } catch {
    return s;
  }
}

function splitCidadeUf(s) {
  if (!s) return { cidade: "", uf: "" };
  const m = s.match(/^(.*)[-/]\s*([A-Z]{2})\s*$/);
  if (m) return { cidade: m[1].trim(), uf: m[2] };
  return { cidade: s.trim(), uf: "" };
}

function withTimeout(promise, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => clearTimeout(t) };
}

function looksLikeSessionExpired(text, status) {
  if (status === 401 || status === 403) return true;
  if (!text) return false;
  const low = text.toLowerCase();
  return (
    low.includes("session expired") ||
    low.includes("sessão expir") ||
    low.includes("sessao expir") ||
    low.includes("window.location") && low.includes("login") ||
    low.includes("loginform")
  );
}

function sessionHeaders(session) {
  const h = {
    "X-Requested-With": "XMLHttpRequest",
    Referer: REFERER,
    Accept: "*/*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    // este uniGUI manda sessão em HEADERS, não em cookies
    _s_id: session.sId,
    unisessionid: session.sId,
  };
  if (session.cookies) h.Cookie = session.cookies;
  return h;
}

async function doPostConsulta(cpfDigits, env) {
  const session = await loadSession(env);
  if (!session.sId) {
    return { ok: false, error: "sessao_ausente", detail: "POST /session/update primeiro" };
  }

  const cpfFmt = formatCpf(cpfDigits);
  const seq = session.seq++;
  // persiste o seq incrementado pra próxima request
  await saveSession(env, session);

  // O uniGUI espera o CPF empacotado dentro do _fp_ (form payload),
  // duplo-encodado, e o _seq_ em hex.
  // Real capturado: _fp_=%26O1162%3D%25020%2502%2502346.917.808-90&_seq_=3f
  const fp = `%26O1162%3D%25020%2502%2502${cpfFmt}`; // CPF literal com pontos/traço
  const seqHex = seq.toString(16);
  const body =
    `Ajax=1` +
    `&IsEvent=1` +
    `&Obj=O117A` +
    `&Evt=click` +
    `&this=O117A` +
    `&_S_ID=${encodeURIComponent(session.sId)}` +
    `&_fp_=${fp}` +
    `&_seq_=${seqHex}` +
    `&_uo_=O112A`;
  console.log("[cpf] POST body", body);

  const { signal, done } = withTimeout(null, TIMEOUT_MS);
  let postRes, postText;
  try {
    postRes = await fetch(HANDLE_EVENT, {
      method: "POST",
      signal,
      headers: {
        ...sessionHeaders(session),
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body,
    });
    postText = await postRes.text();
  } catch (err) {
    return { ok: false, error: "rede", detail: String(err?.message || err) };
  } finally {
    done();
  }

  console.log("[cpf] POST consulta", {
    cpf: cpfDigits.slice(0, 3) + "***",
    status: postRes.status,
    bodyLen: postText.length,
    seq,
    preview: postText.slice(0, 200),
  });

  if (looksLikeSessionExpired(postText, postRes.status)) {
    return { ok: false, error: "sessao_expirada" };
  }

  // GET grid
  const gridUrl =
    `${HANDLE_EVENT}?IsEvent=1&Obj=O11B2&Evt=data` +
    `&_dc=${Date.now()}&options=1&page=1&start=0&limit=25`;

  const { signal: s2, done: d2 } = withTimeout(null, TIMEOUT_MS);
  let gridRes, gridText;
  try {
    gridRes = await fetch(gridUrl, {
      method: "GET",
      signal: s2,
      headers: sessionHeaders(session),
    });
    gridText = await gridRes.text();
  } catch (err) {
    return { ok: false, error: "rede", detail: String(err?.message || err) };
  } finally {
    d2();
  }

  console.log("[cpf] GET grid", {
    status: gridRes.status,
    bodyLen: gridText.length,
    preview: gridText.slice(0, 200),
  });

  if (looksLikeSessionExpired(gridText, gridRes.status)) {
    return { ok: false, error: "sessao_expirada" };
  }

  // parse grid JSON — tolerante a respostas vazias/malformadas do uniGUI
  // (ex: "{[]}" quando não acha o CPF). Tratamos como grid sem linhas.
  let grid = { rows: [] };
  try {
    grid = JSON.parse(gridText);
  } catch {
    console.log("[cpf] grid não-JSON, tratando como vazio:", gridText.slice(0, 100));
  }

  const row = grid?.rows?.[0] || {};
  const dados = {
    nome: row["0"] ?? "",
    sexo: row["1"] ?? "",
    cpf: row["2"] ?? "",
    data_nascimento: row["3"] ?? "",
    nome_mae: row["4"] ?? "",
    nome_pai: row["5"] ?? "",
    logradouro: "",
    numero: "",
    bairro: "",
    cidade: "",
    uf: "",
    cep: "",
    telefone: "",
    cns: "",
    cns_secundario: "",
    outro_cns: "",
  };

  if (!dados.nome && !dados.cpf) {
    // Grid sem resultados — provavelmente CPF não encontrado
    // mas ainda tentamos parsear os setText (alguns sistemas zeram a tela)
  }

  // parse setText do POST response
  const fields = [
    ["logradouro", /O11CB\.setText\("([^"]*)"\)/],
    ["numero", /O11CF\.setText\("([^"]*)"\)/],
    ["bairro", /O11D3\.setText\("([^"]*)"\)/],
    ["cidade_uf", /O11DB\.setText\("([^"]*)"\)/],
    ["cns_secundario", /O11E3\.setText\("([^"]*)"\)/],
    ["cns", /O11E7\.setText\("([^"]*)"\)/],
    ["outro_cns", /O11EB\.setText\("([^"]*)"\)/],
    ["telefone", /O11EF\.setText\("([^"]*)"\)/],
    ["cep", /O11F3\.setText\("([^"]*)"\)/],
  ];
  const parsed = {};
  for (const [k, re] of fields) {
    parsed[k] = unescapeUni(extract(re, postText));
  }

  dados.logradouro = parsed.logradouro;
  dados.numero = parsed.numero;
  dados.bairro = parsed.bairro;
  const { cidade, uf } = splitCidadeUf(parsed.cidade_uf);
  dados.cidade = cidade;
  dados.uf = uf;
  dados.cep = parsed.cep;
  dados.telefone = parsed.telefone;
  dados.cns = parsed.cns;
  dados.cns_secundario = parsed.cns_secundario;
  dados.outro_cns = parsed.outro_cns;

  const hasAnything =
    dados.nome ||
    dados.cpf ||
    dados.logradouro ||
    dados.cns ||
    dados.telefone;
  if (!hasAnything) {
    return { ok: false, error: "cpf_nao_encontrado" };
  }

  return { ok: true, dados };
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "x-api-key,content-type",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, build: BUILD, ts: Date.now() });
    }

    // Página HTML pública para colar o cURL e atualizar a sessão sem terminal.
    // A API key é digitada na própria página e enviada como ?api_key=...
    if (url.pathname === "/capture" && request.method === "GET") {
      return new Response(CAPTURE_HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (!authOk(request, url, env)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    if (url.pathname === "/session" && request.method === "GET") {
      const s = await loadSession(env);
      return json({
        ok: true,
        sId: mask(s.sId),
        cookies: mask(s.cookies),
        seq: s.seq,
        updatedAt: s.updatedAt,
        hasSession: !!s.sId,
        kv: !!env.SESSION_KV,
      });
    }

    if (url.pathname === "/session/update" && request.method === "POST") {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ ok: false, error: "json_invalido" }, 400);
      }
      const cookies = String(payload?.cookies || "").trim();
      const sId = String(payload?.s_id || payload?.sId || "").trim();
      if (!sId) {
        return json({ ok: false, error: "s_id_obrigatorio" }, 400);
      }
      await saveSession(env, { cookies, sId, seq: 1, updatedAt: Date.now() });
      console.log("[session] atualizada", {
        sId: mask(sId),
        cookies: cookies ? mask(cookies) : "(sem cookies)",
      });
      return json({ ok: true, sId: mask(sId), cookies: mask(cookies) });
    }

    // Fallback ultra-simples: GET /session/set?api_key=...&s_id=...&cookies=...
    if (url.pathname === "/session/set" && request.method === "GET") {
      const sId = (url.searchParams.get("s_id") || "").trim();
      const cookies = (url.searchParams.get("cookies") || "").trim();
      if (!sId) {
        return json({ ok: false, error: "s_id_obrigatorio (passe ?s_id=...)" }, 400);
      }
      await saveSession(env, { cookies, sId, seq: 1, updatedAt: Date.now() });
      console.log("[session] set via GET", { sId: mask(sId) });
      return json({ ok: true, sId: mask(sId), cookies: mask(cookies) });
    }

    if (url.pathname === "/cpf" && request.method === "GET") {
      const cpf = (url.searchParams.get("cpf") || "").replace(/\D/g, "");
      if (cpf.length !== 11) {
        return json({ ok: false, error: "cpf_invalido" }, 400);
      }
      try {
        const result = await doPostConsulta(cpf, env);
        const status = result.ok ? 200 : result.error === "sessao_ausente" || result.error === "sessao_expirada" ? 401 : 200;
        return json(result, status);
      } catch (err) {
        console.error("[cpf] erro:", err?.stack || err);
        return json({ ok: false, error: "rede", detail: String(err?.message || err) }, 500);
      }
    }

    return json({ ok: false, error: "not_found" }, 404);
  },
};

// ============================================================
// Página HTML para captura da sessão sem precisar de terminal.
// ============================================================
const CAPTURE_HTML = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Atualizar sessão — spokenmed</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 760px; margin: 32px auto; padding: 0 16px; line-height: 1.5; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  p.sub { color: #666; margin-top: 0; }
  label { display: block; font-weight: 600; margin-top: 16px; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; border: 1px solid #999; border-radius: 6px; background: transparent; color: inherit; }
  textarea { min-height: 220px; }
  button { margin-top: 16px; padding: 10px 16px; font-size: 14px; border-radius: 6px; border: 0; background: #2563eb; color: #fff; cursor: pointer; }
  button:disabled { opacity: .6; cursor: progress; }
  pre { background: rgba(127,127,127,.12); padding: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; }
  .ok { color: #15803d; } .err { color: #b91c1c; }
  ol li { margin: 4px 0; }
  details { margin-top: 24px; }
</style>
</head>
<body>
<h1>Atualizar sessão do Fiorilli</h1>
<p class="sub">Cole o <b>Copy as cURL</b> do DevTools, informe a API key e clique em atualizar. Sem terminal, sem Node.</p>

<ol>
  <li>Entre no sistema da prefeitura pelo Chrome (faça login normalmente).</li>
  <li>Abra DevTools (F12) → aba <b>Network</b>.</li>
  <li>Faça qualquer ação que dispare uma requisição <code>HandleEvent</code>.</li>
  <li>Clique com o botão direito nessa request → <b>Copy</b> → <b>Copy as cURL (cmd)</b>.</li>
  <li>Cole abaixo e clique em <b>Atualizar sessão</b>.</li>
</ol>

<label>API key</label>
<input id="apiKey" type="password" placeholder="sua API_KEY do worker" autocomplete="off" />

<label>cURL completo</label>
<textarea id="curl" placeholder='curl "https://saudeteresopolis.oppcloud.com.br/..." -H "_s_id: ..." ...'></textarea>

<button id="go">Atualizar sessão</button>

<h3>Resultado</h3>
<pre id="out">(aguardando)</pre>

<details>
  <summary>Modo manual (se o cURL não funcionar)</summary>
  <p>Pegue só o valor do header <code>_s_id</code> ou <code>unisessionid</code> no DevTools e abra esta URL no navegador:</p>
  <pre>/session/set?api_key=SUA_KEY&s_id=COLE_AQUI</pre>
</details>

<script>
const $ = (id) => document.getElementById(id);
try { $('apiKey').value = localStorage.getItem('spokenmed_api_key') || ''; } catch(_) {}

function parseCurl(raw) {
  // Normaliza cURL do Windows cmd e bash
  let s = raw
    .replace(/\\^\\r?\\n/g, ' ')
    .replace(/\\^"/g, '"')
    .replace(/\\^\\^/g, '^')
    .replace(/\\\\\\r?\\n/g, ' ');
  const pickHeader = (name) => {
    const re = new RegExp('-H\\\\s+[\\'"]' + name + ':\\\\s*([^\\'"\\\\r\\\\n]+)[\\'"]', 'i');
    const m = s.match(re); return m ? m[1].trim() : '';
  };
  const pickBody = () => {
    const m = s.match(/--data-raw\\s+['"]([^'"]+)['"]/) ||
              s.match(/--data\\s+['"]([^'"]+)['"]/) ||
              s.match(/\\s-d\\s+['"]([^'"]+)['"]/);
    return m ? m[1] : '';
  };
  const cookies = pickHeader('cookie') ||
                  ((s.match(/-b\\s+['"]([^'"]+)['"]/) || [,''])[1]) || '';
  let sId = pickHeader('_s_id') || pickHeader('unisessionid') || '';
  if (!sId) {
    const m = pickBody().match(/_S_ID=([^&]+)/);
    if (m) sId = decodeURIComponent(m[1]);
  }
  return { sId, cookies };
}

$('go').addEventListener('click', async () => {
  const out = $('out');
  const apiKey = $('apiKey').value.trim();
  const raw = $('curl').value;
  if (!apiKey) { out.innerHTML = '<span class=err>Informe a API key.</span>'; return; }
  if (!raw.trim()) { out.innerHTML = '<span class=err>Cole o cURL.</span>'; return; }
  try { localStorage.setItem('spokenmed_api_key', apiKey); } catch(_) {}

  const { sId, cookies } = parseCurl(raw);
  if (!sId) {
    out.innerHTML = '<span class=err>Não encontrei _s_id / unisessionid no cURL.</span>\\n' +
      'Verifique se você copiou exatamente a request <b>HandleEvent</b> com <b>Copy as cURL (cmd)</b>.';
    return;
  }

  $('go').disabled = true;
  out.textContent = 'Enviando...';
  try {
    const r = await fetch('/session/update?api_key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ s_id: sId, cookies })
    });
    const txt = await r.text();
    if (r.ok) {
      out.innerHTML = '<span class=ok>✓ Sessão atualizada (status ' + r.status + ')</span>\\n' + txt +
        '\\n\\nTeste agora: <a href="/session?api_key=' + encodeURIComponent(apiKey) + '" target="_blank">/session</a>';
    } else {
      out.innerHTML = '<span class=err>Falhou (status ' + r.status + ')</span>\\n' + txt;
    }
  } catch (e) {
    out.innerHTML = '<span class=err>Erro de rede: ' + (e && e.message || e) + '</span>';
  } finally {
    $('go').disabled = false;
  }
});
</script>
</body>
</html>`;

