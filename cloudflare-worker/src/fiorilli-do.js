// Durable Object: FiorilliDO
// Singleton (idFromName("global")) que mantém sessão Puppeteer + cookies + _S_ID
// e responde a /lookup?cpf=XXXXXXXXXXX com JSON estruturado.

import puppeteer from "@cloudflare/puppeteer";

const SESSION_TTL_MS = 10 * 60 * 1000;
const PUPPETEER_TIMEOUT_MS = 45_000;
const HTTP_TIMEOUT_MS = 15_000;

function formatCpfMasked(cpf) {
  const d = cpf.replace(/\D/g, "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function jarToHeader(jar) {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function ingestSetCookies(res, jar) {
  const getter = res.headers.getSetCookie?.bind(res.headers);
  const list = getter
    ? getter()
    : (() => {
        const raw = res.headers.get("set-cookie");
        return raw ? [raw] : [];
      })();
  for (const sc of list) {
    const first = sc.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
}

function decodeJsString(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseUniguiResponse(js) {
  const raw = {};
  const reList = [
    /(O[0-9A-Fa-f]+)\.setText\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
    /(O[0-9A-Fa-f]+)\.setText\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g,
    /(O[0-9A-Fa-f]+)\.stateValue\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
    /(O[0-9A-Fa-f]+)\.originalValue\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
  ];
  for (const re of reList) {
    let m;
    while ((m = re.exec(js)) !== null) {
      const id = m[1];
      const value = decodeJsString(m[2]);
      if (!(id in raw)) raw[id] = value;
    }
  }

  const cidadeRaw = raw["O11DB"] ?? null;
  let cidade = null;
  let uf = null;
  if (cidadeRaw) {
    const parts = cidadeRaw.split("-").map((s) => s.trim());
    if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
      uf = parts[parts.length - 1].toUpperCase();
      cidade = parts.slice(0, -1).join("-");
    } else {
      cidade = cidadeRaw;
    }
  }

  const knownIds = new Set(["O11CB", "O11CF", "O11D3", "O11DB", "O11E3", "O11E7"]);
  let nome = null;
  for (const [id, value] of Object.entries(raw)) {
    if (knownIds.has(id)) continue;
    const t = value.trim();
    if (t.length >= 6 && t.length <= 120 && /\s/.test(t) && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+$/.test(t)) {
      nome = t;
      break;
    }
  }

  let telefone = null;
  for (const value of Object.values(raw)) {
    const t = value.trim();
    if (/^\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/.test(t)) {
      telefone = t;
      break;
    }
  }

  return {
    raw,
    logradouro: raw["O11CB"] ?? null,
    numero: raw["O11CF"] ?? null,
    bairro: raw["O11D3"] ?? null,
    cidade,
    uf,
    cns: raw["O11E3"] ?? null,
    cns_secundario: raw["O11E7"] ?? null,
    nome,
    telefone,
  };
}

function looksLikeSessionExpired(js) {
  if (/\.setText\(/i.test(js)) return false;
  return /login|sess[aã]o|expirad|invalid|_S_ID/i.test(js) || js.length < 50;
}

export class FiorilliDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.session = null; // { cookies: Map, sId, createdAt }
    this.seq = 0xe0;
    this.bootstrapPromise = null;
    this.lookupQueue = Promise.resolve();
  }

  nextSeq() {
    const s = this.seq.toString(16);
    this.seq += 1;
    return s;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/lookup") {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const cpf = (url.searchParams.get("cpf") || "").replace(/\D/g, "");
    if (cpf.length !== 11) {
      return new Response(JSON.stringify({ ok: false, error: "cpf_invalido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    try {
      const result = await this.runLookupSerialized(cpf);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      console.error("[do] lookup error:", err?.stack || err);
      return new Response(
        JSON.stringify({ ok: false, error: "rede", detail: String(err?.message || err) }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  }

  async runLookupSerialized(cpf) {
    const prev = this.lookupQueue.catch(() => null);
    let release;
    const next = new Promise((r) => {
      release = r;
    });
    this.lookupQueue = prev.then(() => next);
    await prev;
    try {
      await this.ensureSession();
      let js = await this.rawLookup(cpf);
      if (looksLikeSessionExpired(js)) {
        console.log("[do] sessão expirada, refazendo login");
        this.session = null;
        await this.ensureSession();
        js = await this.rawLookup(cpf);
      }
      const parsed = parseUniguiResponse(js);
      const setTextCount = Object.keys(parsed.raw).length;
      if (setTextCount === 0) {
        return { ok: false, error: "lookup_sem_resposta" };
      }
      if (!parsed.logradouro && !parsed.cns && !parsed.cidade && !parsed.nome) {
        return { ok: false, error: "cpf_nao_encontrado" };
      }
      return {
        ok: true,
        dados: {
          nome: parsed.nome,
          logradouro: parsed.logradouro,
          numero: parsed.numero,
          bairro: parsed.bairro,
          cidade: parsed.cidade,
          uf: parsed.uf,
          cns: parsed.cns,
          cns_secundario: parsed.cns_secundario,
          telefone: parsed.telefone,
        },
      };
    } finally {
      release();
    }
  }

  async ensureSession() {
    if (this.session && Date.now() - this.session.createdAt < SESSION_TTL_MS) return;
    if (this.bootstrapPromise) return this.bootstrapPromise;
    this.bootstrapPromise = (async () => {
      try {
        this.session = await this.bootstrap();
      } finally {
        this.bootstrapPromise = null;
      }
    })();
    return this.bootstrapPromise;
  }

  async bootstrap() {
    const baseUrl = (this.env.OPP_BASE_URL || "").replace(/\/+$/, "");
    const user = this.env.OPP_USERNAME;
    const pass = this.env.OPP_PASSWORD;
    const sisIndex = `${baseUrl}/sis/`;

    let browser = null;
    try {
      browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      page.setDefaultTimeout(PUPPETEER_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT_MS);

      await page.goto(sisIndex, { waitUntil: "networkidle0" });
      console.log("[do] /sis/ loaded:", page.url());

      const userSel = "#O30 input, input#O30, input[name='O30']";
      const passSel = "#O34 input, input#O34, input[name='O34']";

      await page.waitForSelector(userSel, { visible: true });
      await page.click(userSel, { clickCount: 3 });
      await page.type(userSel, user, { delay: 30 });

      await page.waitForSelector(passSel, { visible: true });
      await page.click(passSel, { clickCount: 3 });
      await page.type(passSel, pass, { delay: 30 });

      const loginBtnSel = "#O40, [id='O40']";
      await page.waitForSelector(loginBtnSel);

      const navPromise = page
        .waitForFunction(() => /\/ambulatorio\//i.test(window.location.pathname), {
          timeout: PUPPETEER_TIMEOUT_MS,
        })
        .catch(() => null);

      await page.click(loginBtnSel);
      const navOk = await navPromise;

      if (!navOk) {
        const snippet = (await page.content()).slice(0, 1200);
        console.error("[do] login não redirecionou. URL:", page.url(), "html:", snippet);
        throw new Error("login_invalido");
      }

      await page
        .waitForNavigation({ waitUntil: "networkidle0", timeout: PUPPETEER_TIMEOUT_MS })
        .catch(() => null);
      await page.waitForFunction(() => document.readyState === "complete").catch(() => null);

      const sId = await page
        .evaluate(() => {
          const html = document.documentElement.outerHTML;
          const patterns = [
            /_S_ID["']?\s*[:=]\s*["']([^"']+)["']/i,
            /name=["']_S_ID["']\s+value=["']([^"']+)["']/i,
            /[?&]_S_ID=([A-Za-z0-9._-]+)/i,
          ];
          for (const re of patterns) {
            const m = html.match(re);
            if (m?.[1]) return m[1];
          }
          return null;
        })
        .catch(() => null);

      if (!sId) throw new Error("login_invalido: _S_ID ausente");

      const cookies = await page.cookies();
      const jar = new Map();
      for (const c of cookies) jar.set(c.name, c.value);

      console.log("[do] session ready. cookies:", jar.size);
      return { cookies: jar, sId, createdAt: Date.now() };
    } finally {
      try {
        await browser?.close();
      } catch {
        /* ignore */
      }
    }
  }

  async rawLookup(cpf) {
    const baseUrl = (this.env.OPP_BASE_URL || "").replace(/\/+$/, "");
    const url = `${baseUrl}/ambulatorio/ambulatorio.dll/HandleEvent`;
    const referer = `${baseUrl}/ambulatorio/ambulatorio.dll/`;
    const cpfFmt = formatCpfMasked(cpf);
    const fp = `%26O1162%3D%25024%2502%2502${encodeURIComponent(cpfFmt)}`;
    const seq = this.nextSeq();

    const body =
      `Ajax=1&IsEvent=1&Obj=O117A&Evt=click&this=O117A` +
      `&_S_ID=${encodeURIComponent(this.session.sId)}` +
      `&fp=${fp}` +
      `&seq=${seq}` +
      `&uo=O112A`;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), HTTP_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        signal: ac.signal,
        redirect: "follow",
        headers: {
          Accept: "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
          Origin: new URL(referer).origin,
          Referer: referer,
          "X-Requested-With": "XMLHttpRequest",
          Cookie: jarToHeader(this.session.cookies),
        },
        body,
      });
    } finally {
      clearTimeout(t);
    }
    ingestSetCookies(res, this.session.cookies);
    const text = await res.text();
    console.log("[do] lookup", { status: res.status, seq, bodyLen: text.length });
    return text;
  }
}
