// Server-only client for the Fiorilli/OPP (uniGUI) system.
// Login uses Cloudflare Browser Rendering (Puppeteer) once per ~10 min.
// All CPF lookups after that are pure HTTP POSTs against HandleEvent.
//
// SECURITY: Never import this from client code. Cookies, _S_ID and
// credentials live exclusively in the server runtime.

import puppeteer from "@cloudflare/puppeteer";

type CookieJar = Map<string, string>;

type Session = {
  baseUrl: string;
  cookies: CookieJar;
  sId: string;
  createdAt: number;
};

export type TraceStep = {
  step: string;
  ok: boolean;
  status?: number;
  bodyLen?: number;
  preview?: string;
  note?: string;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const PUPPETEER_TIMEOUT_MS = 45_000;

let cachedSession: Session | null = null;
let bootstrapInflight: Promise<Session> | null = null;
// Mutex chain to serialize seq across concurrent lookups.
let lookupQueue: Promise<unknown> = Promise.resolve();
// Hex sequence counter (matches the ?seq=e0, e1, ... pattern used by uniGUI).
let seqCounter = 0xe0;

function nextSeq(): string {
  const s = seqCounter.toString(16);
  seqCounter += 1;
  return s;
}

// ----------- helpers -----------

function maskCpf(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return "***";
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

function formatCpfMasked(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function jarToHeader(jar: CookieJar): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function ingestSetCookies(res: Response, jar: CookieJar): void {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const list: string[] =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
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

function maskPreview(text: string, secrets: string[]): string {
  let out = text.slice(0, 600);
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join("***");
  }
  out = out.replace(/_S_ID["']?\s*[:=]\s*["']?[A-Za-z0-9._-]+/gi, "_S_ID=***");
  return out;
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

function getEnv(): { baseUrl: string; user: string; pass: string } | null {
  const baseUrl = (process.env.OPP_BASE_URL ?? "").replace(/\/+$/, "");
  const user = process.env.OPP_USERNAME ?? "";
  const pass = process.env.OPP_PASSWORD ?? "";
  if (!baseUrl || !user || !pass) return null;
  return { baseUrl, user, pass };
}

type CFEnv = { BROWSER?: unknown };
function getBrowserBinding(): unknown | null {
  const g = globalThis as unknown as { __CF_ENV?: CFEnv };
  return g.__CF_ENV?.BROWSER ?? null;
}

// ----------- error model -----------

export type ErrorCode =
  | "config_ausente"
  | "browser_indisponivel"
  | "login_invalido"
  | "lookup_sem_resposta"
  | "cpf_nao_encontrado"
  | "timeout"
  | "rede";

class OppError extends Error {
  constructor(
    public code: ErrorCode,
    msg: string,
  ) {
    super(msg);
  }
}

// ----------- bootstrap (Puppeteer) -----------

async function bootstrapWithPuppeteer(trace?: TraceStep[]): Promise<Session> {
  const env = getEnv();
  if (!env) throw new OppError("config_ausente", "OPP_* env vars not set");

  const browserBinding = getBrowserBinding();
  if (!browserBinding) {
    trace?.push({ step: "puppeteer.binding", ok: false, note: "env.BROWSER ausente" });
    throw new OppError(
      "browser_indisponivel",
      "Cloudflare Browser Rendering binding (BROWSER) não disponível neste runtime",
    );
  }

  const { baseUrl, user, pass } = env;
  const sisIndex = `${baseUrl}/sis/`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browser = await puppeteer.launch(browserBinding as any);
    trace?.push({ step: "puppeteer.launch", ok: true });
    console.log("[opp] puppeteer launched");

    const page = await browser.newPage();
    page.setDefaultTimeout(PUPPETEER_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT_MS);

    await page.goto(sisIndex, { waitUntil: "networkidle0" });
    trace?.push({ step: "puppeteer.goto /sis/", ok: true, note: page.url() });
    console.log("[opp] /sis/ loaded:", page.url());

    // uniGUI renders inputs deep — use focus by tabbing into the form.
    // The username field id is O30 and password is O34. They are typically
    // <input> children of a wrapper with that id.
    const userSel = "#O30 input, input#O30, input[name='O30']";
    const passSel = "#O34 input, input#O34, input[name='O34']";

    await page.waitForSelector(userSel, { visible: true });
    await page.click(userSel, { clickCount: 3 });
    await page.type(userSel, user, { delay: 30 });

    await page.waitForSelector(passSel, { visible: true });
    await page.click(passSel, { clickCount: 3 });
    await page.type(passSel, pass, { delay: 30 });

    trace?.push({ step: "puppeteer.fill credentials", ok: true });

    const loginBtnSel = "#O40, [id='O40']";
    await page.waitForSelector(loginBtnSel);

    // Login click triggers an in-page setUrl(...) to /ambulatorio/.
    // We wait for the URL to change to /ambulatorio/.
    const navPromise = page
      .waitForFunction(
        () => /\/ambulatorio\//i.test(window.location.pathname),
        { timeout: PUPPETEER_TIMEOUT_MS },
      )
      .catch(() => null);

    await page.click(loginBtnSel);
    const navOk = await navPromise;

    if (!navOk) {
      const html = await page.content();
      console.error("[opp] login did not redirect. URL:", page.url());
      console.error("[opp] page snippet:", html.slice(0, 1500));
      trace?.push({
        step: "puppeteer.login",
        ok: false,
        note: `URL após click: ${page.url()}`,
        preview: maskPreview(html, [user, pass]),
      });
      throw new OppError("login_invalido", "Login não redirecionou para /ambulatorio/");
    }

    // Ensure the ambulatório page actually finished loading
    await page
      .waitForNavigation({ waitUntil: "networkidle0", timeout: PUPPETEER_TIMEOUT_MS })
      .catch(() => null);
    await page.waitForFunction(() => document.readyState === "complete").catch(() => null);

    const finalUrl = page.url();
    console.log("[opp] post-login url:", finalUrl);

    // Extract _S_ID from the ambulatório page
    const sIdFromPage = await page
      .evaluate(() => {
        // Common locations in uniGUI: meta tag, embedded JS, or URL.
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

    if (!sIdFromPage) {
      throw new OppError("login_invalido", "Não foi possível extrair _S_ID após login");
    }

    // Collect cookies from the browser context
    const cookies = await page.cookies();
    const jar: CookieJar = new Map();
    for (const c of cookies) jar.set(c.name, c.value);

    trace?.push({
      step: "puppeteer.session",
      ok: true,
      note: `_S_ID=*** cookies=${jar.size}`,
    });
    console.log("[opp] session ready. cookies:", jar.size, "url:", finalUrl);

    return {
      baseUrl,
      cookies: jar,
      sId: sIdFromPage,
      createdAt: Date.now(),
    };
  } catch (err) {
    if (err instanceof OppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[opp] puppeteer error:", msg);
    trace?.push({ step: "puppeteer", ok: false, note: msg });
    throw new OppError(msg.includes("timeout") ? "timeout" : "rede", msg);
  } finally {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
  }
}

async function getSession(force = false, trace?: TraceStep[]): Promise<Session> {
  if (!force && cachedSession && Date.now() - cachedSession.createdAt < SESSION_TTL_MS) {
    trace?.push({ step: "session.cache", ok: true, note: "reutilizando sessão" });
    return cachedSession;
  }
  if (bootstrapInflight && !trace) return bootstrapInflight;
  bootstrapInflight = (async () => {
    try {
      const s = await bootstrapWithPuppeteer(trace);
      cachedSession = s;
      return s;
    } finally {
      bootstrapInflight = null;
    }
  })();
  return bootstrapInflight;
}

// ----------- HTTP lookup -----------

async function rawLookup(session: Session, cpf: string, trace?: TraceStep[]): Promise<string> {
  const url = `${session.baseUrl}/ambulatorio/ambulatorio.dll/HandleEvent`;
  const referer = `${session.baseUrl}/ambulatorio/ambulatorio.dll/`;
  const cpfFmt = formatCpfMasked(cpf);
  const fp = `%26O1162%3D%25024%2502%2502${encodeURIComponent(cpfFmt)}`;
  const seq = nextSeq();

  const body =
    `Ajax=1&IsEvent=1&Obj=O117A&Evt=click&this=O117A` +
    `&_S_ID=${encodeURIComponent(session.sId)}` +
    `&fp=${fp}` +
    `&seq=${seq}` +
    `&uo=O112A`;

  const res = await timedFetch(url, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
      Origin: new URL(referer).origin,
      Referer: referer,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: jarToHeader(session.cookies),
    },
    body,
  });
  ingestSetCookies(res, session.cookies);
  const text = await res.text();

  trace?.push({
    step: "http.lookup",
    ok: res.status === 200,
    status: res.status,
    bodyLen: text.length,
    preview: maskPreview(text, [maskCpf(cpf)]),
    note: `seq=${seq} setText=${(text.match(/\.setText\(/g) ?? []).length}`,
  });
  console.log("[opp] lookup", {
    cpf: maskCpf(cpf),
    status: res.status,
    seq,
    bodyLen: text.length,
  });

  return text;
}

function looksLikeSessionExpired(js: string): boolean {
  if (/\.setText\(/i.test(js)) return false;
  return /login|sess[aã]o|expirad|invalid|_S_ID/i.test(js) || js.length < 50;
}

// ----------- parser -----------

function decodeJsString(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .trim();
}

export type ParsedFields = {
  raw: Record<string, string>;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cns: string | null;
  cns_secundario: string | null;
  nome: string | null;
  telefone: string | null;
};

export function parseUniguiResponse(js: string): ParsedFields {
  const raw: Record<string, string> = {};
  const reList = [
    /(O[0-9A-Fa-f]+)\.setText\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
    /(O[0-9A-Fa-f]+)\.setText\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g,
    /(O[0-9A-Fa-f]+)\.stateValue\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
    /(O[0-9A-Fa-f]+)\.originalValue\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
  ];
  for (const re of reList) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(js)) !== null) {
      const id = m[1];
      const value = decodeJsString(m[2]);
      // first-write wins for setText; later writes (focus, etc.) shouldn't clobber
      if (!(id in raw)) raw[id] = value;
    }
  }

  const cidadeRaw = raw["O11DB"] ?? null;
  let cidade: string | null = null;
  let uf: string | null = null;
  if (cidadeRaw) {
    const parts = cidadeRaw.split("-").map((s) => s.trim());
    if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
      uf = parts[parts.length - 1].toUpperCase();
      cidade = parts.slice(0, -1).join("-");
    } else {
      cidade = cidadeRaw;
    }
  }

  // Heuristic: nome = uppercase string with spaces, not in known mapped IDs
  const knownIds = new Set(["O11CB", "O11CF", "O11D3", "O11DB", "O11E3", "O11E7"]);
  let nome: string | null = null;
  for (const [id, value] of Object.entries(raw)) {
    if (knownIds.has(id)) continue;
    const t = value.trim();
    if (t.length >= 6 && t.length <= 120 && /\s/.test(t) && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+$/.test(t)) {
      nome = t;
      break;
    }
  }

  // Heuristic: phone = formatted brazilian phone
  let telefone: string | null = null;
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

// ----------- public API -----------

export type CadSusResult =
  | {
      ok: true;
      dados: {
        nome: string | null;
        logradouro: string | null;
        numero: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
        cns: string | null;
        cns_secundario: string | null;
        telefone: string | null;
      };
    }
  | { ok: false; error: ErrorCode };

export type LookupOutput = { result: CadSusResult; trace: TraceStep[] };

async function runLookupSerialized(cpf: string, trace?: TraceStep[]): Promise<string> {
  // Chain onto the previous lookup so seq is monotonic across concurrent calls.
  const prev = lookupQueue.catch(() => null);
  let release!: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  lookupQueue = prev.then(() => next);
  await prev;
  try {
    let session = await getSession(false, trace);
    let js = await rawLookup(session, cpf, trace);
    if (looksLikeSessionExpired(js)) {
      trace?.push({ step: "session.refresh", ok: true, note: "sessão expirada, refazendo login" });
      console.log("[opp] session expired, re-bootstrapping");
      cachedSession = null;
      session = await getSession(true, trace);
      js = await rawLookup(session, cpf, trace);
    }
    return js;
  } finally {
    release();
  }
}

export async function buscarPacienteCpfWithTrace(cpfInput: string): Promise<LookupOutput> {
  const trace: TraceStep[] = [];
  const cpf = cpfInput.replace(/\D/g, "");
  if (cpf.length !== 11) {
    return { result: { ok: false, error: "cpf_nao_encontrado" }, trace };
  }

  let js: string;
  try {
    js = await runLookupSerialized(cpf, trace);
  } catch (err) {
    const code: ErrorCode = err instanceof OppError ? err.code : "rede";
    console.error("[opp] lookup failed", {
      code,
      msg: err instanceof Error ? err.message : String(err),
      cpf: maskCpf(cpf),
    });
    return { result: { ok: false, error: code }, trace };
  }

  const parsed = parseUniguiResponse(js);
  const setTextCount = Object.keys(parsed.raw).length;

  if (setTextCount === 0) {
    return { result: { ok: false, error: "lookup_sem_resposta" }, trace };
  }
  if (!parsed.logradouro && !parsed.cns && !parsed.cidade && !parsed.nome) {
    trace.push({
      step: "parse",
      ok: false,
      note: `nenhum campo conhecido. IDs: ${Object.keys(parsed.raw).slice(0, 20).join(",")}`,
    });
    return { result: { ok: false, error: "cpf_nao_encontrado" }, trace };
  }

  return {
    result: {
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
    },
    trace,
  };
}

export async function buscarPacienteCpf(cpfInput: string): Promise<CadSusResult> {
  const { result } = await buscarPacienteCpfWithTrace(cpfInput);
  return result;
}

export function clearOppSessionCache() {
  cachedSession = null;
}
