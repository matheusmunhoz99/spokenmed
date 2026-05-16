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

const BUILD = "fiorilli-http-v1";
const BASE = "https://saudeteresopolis.oppcloud.com.br";
const HANDLE_EVENT = `${BASE}/ambulatorio/ambulatorio.dll/HandleEvent`;
const REFERER = `${BASE}/ambulatorio/ambulatorio.dll/`;
const TIMEOUT_MS = 30_000;

// estado em memória (per-isolate)
let SESSION = {
  cookies: "", // string pronta pro header Cookie
  sId: "",
  seq: 1,
  updatedAt: 0,
};

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

function sessionHeaders() {
  const h = {
    "X-Requested-With": "XMLHttpRequest",
    Referer: REFERER,
    Accept: "*/*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    // este uniGUI manda sessão em HEADERS, não em cookies
    _s_id: SESSION.sId,
    unisessionid: SESSION.sId,
  };
  if (SESSION.cookies) h.Cookie = SESSION.cookies;
  return h;
}

async function doPostConsulta(cpfDigits) {
  if (!SESSION.sId) {
    return { ok: false, error: "sessao_ausente", detail: "POST /session/update primeiro" };
  }

  const cpfFmt = formatCpf(cpfDigits);
  const seq = SESSION.seq++;

  // Body EXATO conforme spec do usuário.
  // O11162 valor: %021%02%02CPF_FORMATADO
  const o1162 = `%021%02%02${encodeURIComponent(cpfFmt)}`;
  const body =
    `Ajax=1` +
    `&IsEvent=1` +
    `&Obj=O117A` +
    `&Evt=click` +
    `&this=O117A` +
    `&_S_ID=${encodeURIComponent(SESSION.sId)}` +
    `&_fp_=` +
    `&O1162=${o1162}` +
    `&_seq_=${seq}` +
    `&_uo_=O112A`;

  const { signal, done } = withTimeout(null, TIMEOUT_MS);
  let postRes, postText;
  try {
    postRes = await fetch(HANDLE_EVENT, {
      method: "POST",
      signal,
      headers: {
        ...sessionHeaders(),
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
      headers: sessionHeaders(),
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

  // parse grid JSON
  let grid;
  try {
    grid = JSON.parse(gridText);
  } catch {
    return { ok: false, error: "grid_invalida", detail: gridText.slice(0, 300) };
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

    if (!authOk(request, url, env)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    if (url.pathname === "/session" && request.method === "GET") {
      return json({
        ok: true,
        sId: mask(SESSION.sId),
        cookies: mask(SESSION.cookies),
        seq: SESSION.seq,
        updatedAt: SESSION.updatedAt,
        hasSession: !!(SESSION.sId && SESSION.cookies),
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
      if (!cookies || !sId) {
        return json({ ok: false, error: "cookies_e_s_id_obrigatorios" }, 400);
      }
      SESSION = { cookies, sId, seq: 1, updatedAt: Date.now() };
      console.log("[session] atualizada", {
        sId: mask(sId),
        cookies: mask(cookies),
      });
      return json({ ok: true, sId: mask(sId), cookies: mask(cookies) });
    }

    if (url.pathname === "/cpf" && request.method === "GET") {
      const cpf = (url.searchParams.get("cpf") || "").replace(/\D/g, "");
      if (cpf.length !== 11) {
        return json({ ok: false, error: "cpf_invalido" }, 400);
      }
      try {
        const result = await doPostConsulta(cpf);
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
