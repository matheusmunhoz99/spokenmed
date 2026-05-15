// Server-only client for the Fiorilli/OPP system.
// SECURITY: Never import this from client code. Credentials, cookies and
// session IDs live exclusively in the server runtime.

type CookieJar = Map<string, string>;

type Session = {
  baseUrl: string;
  cookies: CookieJar;
  sId: string;
  ambulatorioReady: boolean;
  createdAt: number;
};

export type TraceStep = {
  step: string;
  ok: boolean;
  status?: number;
  bodyLen?: number;
  setCookies?: string[];
  preview?: string;
  note?: string;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;

let cachedSession: Session | null = null;
let bootstrapInflight: Promise<Session> | null = null;
let seqCounter = 1;

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

function ingestSetCookies(res: Response, jar: CookieJar): string[] {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const list: string[] =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : (() => {
          const raw = res.headers.get("set-cookie");
          return raw ? [raw] : [];
        })();
  const names: string[] = [];
  for (const sc of list) {
    const first = sc.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) {
      jar.set(name, value);
      names.push(name);
    }
  }
  return names;
}

function maskPreview(text: string, secrets: string[]): string {
  let out = text.slice(0, 600);
  for (const s of secrets) {
    if (s && s.length >= 3) {
      out = out.split(s).join("***");
    }
  }
  out = out.replace(/_S_ID["']?\s*[:=]\s*["']?[A-Za-z0-9._-]+/gi, "_S_ID=***");
  out = out.replace(/[?&]user=[^&"'\s]+/gi, "&user=***");
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

function extractSId(text: string): string | null {
  const patterns = [
    /_S_ID["']?\s*[:=]\s*["']([^"']+)["']/i,
    /name=["']_S_ID["']\s+value=["']([^"']+)["']/i,
    /[?&]_S_ID=([A-Za-z0-9._-]+)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

function extractAmbulatorioToken(js: string): string | null {
  const m = js.match(/setUrl\(["']([^"']*ambulatorio\.dll\/?\?user=[^"']+)["']\)/i);
  if (!m) return null;
  const tokenMatch = m[1].match(/[?&]user=([^&"']+)/);
  return tokenMatch ? tokenMatch[1] : null;
}

function getEnv(): { baseUrl: string; user: string; pass: string } | null {
  const baseUrl = (process.env.OPP_BASE_URL ?? "").replace(/\/+$/, "");
  const user = process.env.OPP_USERNAME ?? "";
  const pass = process.env.OPP_PASSWORD ?? "";
  if (!baseUrl || !user || !pass) return null;
  return { baseUrl, user, pass };
}

function commonHeaders(jar: CookieJar, referer: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    Referer: referer,
  };
  const cookieHeader = jarToHeader(jar);
  if (cookieHeader) h["Cookie"] = cookieHeader;
  return h;
}

async function postHandleEvent(
  url: string,
  jar: CookieJar,
  referer: string,
  body: Record<string, string>,
): Promise<{ res: Response; text: string; setCookies: string[] }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) params.set(k, v);
  const res = await timedFetch(url, {
    method: "POST",
    headers: {
      ...commonHeaders(jar, referer),
      Origin: new URL(referer).origin,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: params.toString(),
  });
  const setCookies = ingestSetCookies(res, jar);
  const text = await res.text();
  return { res, text, setCookies };
}

export type ErrorCode =
  | "config_ausente"
  | "seed_falhou"
  | "login_invalido"
  | "ambulatorio_indisponivel"
  | "lookup_sem_resposta"
  | "cpf_nao_encontrado"
  | "timeout"
  | "rede";

export type CadSusResult =
  | {
      success: true;
      cpf: string;
      nome: string | null;
      endereco: string | null;
      numero: string | null;
      bairro: string | null;
      cidade: string | null;
      uf: string | null;
      cns: string | null;
      cns_secundario: string | null;
      telefone: string | null;
    }
  | { success: false; error: ErrorCode };

class OppError extends Error {
  constructor(
    public code: ErrorCode,
    msg: string,
  ) {
    super(msg);
  }
}

async function bootstrapSession(trace?: TraceStep[]): Promise<Session> {
  const env = getEnv();
  if (!env) {
    console.error("[opp] env_missing", {
      baseUrl: !!process.env.OPP_BASE_URL,
      user: !!process.env.OPP_USERNAME,
      pass: !!process.env.OPP_PASSWORD,
    });
    throw new OppError("config_ausente", "OPP_* env vars not set");
  }
  const { baseUrl, user, pass } = env;
  const jar: CookieJar = new Map();
  const secrets = [user, pass];

  // Step 1: GET /sis/
  const sisIndex = `${baseUrl}/sis/`;

  console.log("BASE_URL", baseUrl);
  console.log("URL_FINAL", sisIndex);
  let indexRes: Response;
  let indexHtml = "";
  try {
    indexRes = await timedFetch(sisIndex, { headers: commonHeaders(jar, baseUrl) });
    const sc = ingestSetCookies(indexRes, jar);
    indexHtml = await indexRes.text();
    console.log(indexHtml.slice(0, 1000));

    if (
      indexHtml.includes("Just a moment") ||
      indexHtml.includes("cf-browser-verification") ||
      indexHtml.includes("Cloudflare")
    ) {
      throw new OppError("seed_falhou", "Cloudflare bloqueou a sessão");
    }
    const sIdSeed = extractSId(indexHtml);
    trace?.push({
      step: "GET /sis/",
      ok: !!sIdSeed,
      status: indexRes.status,
      bodyLen: indexHtml.length,
      setCookies: sc,
      preview: maskPreview(indexHtml, secrets),
      note: sIdSeed ? "S_ID seed encontrado" : "S_ID NÃO encontrado no HTML",
    });
    console.log("[opp] step=seed", {
      status: indexRes.status,
      bodyLen: indexHtml.length,
      cookies: sc,
      sIdSeed: !!sIdSeed,
    });
    if (!sIdSeed) {
      throw new OppError("seed_falhou", indexHtml.slice(0, 1200));
    }
    var sId = sIdSeed;
  } catch (err) {
    if (err instanceof OppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    trace?.push({ step: "GET /sis/", ok: false, note: `fetch falhou: ${msg}` });
    console.error("[opp] step=seed fetch_fail", { msg });
    throw new OppError(msg.includes("abort") ? "timeout" : "rede", msg);
  }

  const sisHandle = `${baseUrl}/sis/sis.dll/HandleEvent`;
  const baseFields = { Ajax: "1", IsEvent: "1", _S_ID: sId };

  // Step 2: username
  try {
    const r = await postHandleEvent(sisHandle, jar, sisIndex, {
      ...baseFields,
      Obj: "O30",
      Evt: "keydown",
      this: "O30",
      key: "70",
      ss: "0",
      _fp_: `%26O30%3D%25020%2502%2502${encodeURIComponent(user)}`,
      _seq_: String(seqCounter++),
      _uo_: "O0",
    });
    trace?.push({
      step: "POST username (O30)",
      ok: r.res.status === 200,
      status: r.res.status,
      bodyLen: r.text.length,
      setCookies: r.setCookies,
      preview: maskPreview(r.text, secrets),
    });
    console.log("[opp] step=username", { status: r.res.status, bodyLen: r.text.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    trace?.push({ step: "POST username (O30)", ok: false, note: msg });
    throw new OppError(msg.includes("abort") ? "timeout" : "rede", msg);
  }

  // Step 3: password
  try {
    const r = await postHandleEvent(sisHandle, jar, sisIndex, {
      ...baseFields,
      Obj: "O34",
      Evt: "keydown",
      this: "O34",
      key: "50",
      ss: "0",
      _fp_: `%26O34%3D%25027%2502%2502${encodeURIComponent(pass)}`,
      _seq_: String(seqCounter++),
      _uo_: "O0",
    });
    trace?.push({
      step: "POST password (O34)",
      ok: r.res.status === 200,
      status: r.res.status,
      bodyLen: r.text.length,
      setCookies: r.setCookies,
      preview: maskPreview(r.text, secrets),
    });
    console.log("[opp] step=password", { status: r.res.status, bodyLen: r.text.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    trace?.push({ step: "POST password (O34)", ok: false, note: msg });
    throw new OppError(msg.includes("abort") ? "timeout" : "rede", msg);
  }

  // Step 4: login click
  let token: string | null;
  try {
    const r = await postHandleEvent(sisHandle, jar, sisIndex, {
      ...baseFields,
      Obj: "O40",
      Evt: "click",
      this: "O40",
      _fp_: `%26O34%3D%25027%2502%2502${encodeURIComponent(pass)}`,
      _uo_: "O0",
      _seq_: String(seqCounter++),
    });
    token = extractAmbulatorioToken(r.text);
    trace?.push({
      step: "POST login click (O40)",
      ok: !!token,
      status: r.res.status,
      bodyLen: r.text.length,
      setCookies: r.setCookies,
      preview: maskPreview(r.text, secrets),
      note: token ? "token ambulatorio extraído" : "setUrl(...ambulatorio...) ausente",
    });
    console.log("[opp] step=login", {
      status: r.res.status,
      bodyLen: r.text.length,
      hasToken: !!token,
      preview: maskPreview(r.text, secrets).slice(0, 200),
    });

    console.log("LOGIN_RESPONSE_START");
    console.log(r.text.slice(0, 4000));
    console.log("LOGIN_RESPONSE_END");

    if (!token) {
      throw new OppError("login_invalido", r.text.slice(0, 4000));
    }
  } catch (err) {
    if (err instanceof OppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    trace?.push({ step: "POST login click (O40)", ok: false, note: msg });
    throw new OppError(msg.includes("abort") ? "timeout" : "rede", msg);
  }

  // Step 5: open ambulatorio
  let ambSid = sId;
  try {
    const ambUrl = `${baseUrl}/ambulatorio/ambulatorio.dll/?user=${encodeURIComponent(token)}`;
    const ambRes = await timedFetch(ambUrl, { headers: commonHeaders(jar, sisIndex) });
    const sc = ingestSetCookies(ambRes, jar);
    const ambHtml = await ambRes.text();
    const newSid = extractSId(ambHtml);
    if (newSid) ambSid = newSid;
    trace?.push({
      step: "GET /ambulatorio/?user=***",
      ok: ambRes.status === 200,
      status: ambRes.status,
      bodyLen: ambHtml.length,
      setCookies: sc,
      preview: maskPreview(ambHtml, secrets),
      note: newSid ? "novo S_ID capturado" : "sem S_ID novo, usando o anterior",
    });
    console.log("[opp] step=ambulatorio", {
      status: ambRes.status,
      bodyLen: ambHtml.length,
      cookies: sc,
      newSid: !!newSid,
    });
    if (ambRes.status >= 400) {
      throw new OppError("ambulatorio_indisponivel", `status ${ambRes.status}`);
    }
  } catch (err) {
    if (err instanceof OppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    trace?.push({ step: "GET /ambulatorio/", ok: false, note: msg });
    throw new OppError(msg.includes("abort") ? "timeout" : "rede", msg);
  }

  return {
    baseUrl,
    cookies: jar,
    sId: ambSid,
    ambulatorioReady: true,
    createdAt: Date.now(),
  };
}

async function getSession(force = false, trace?: TraceStep[]): Promise<Session> {
  if (!force && cachedSession && Date.now() - cachedSession.createdAt < SESSION_TTL_MS) {
    trace?.push({ step: "session", ok: true, note: "usando sessão em cache" });
    return cachedSession;
  }
  if (bootstrapInflight && !trace) return bootstrapInflight;
  bootstrapInflight = (async () => {
    try {
      const s = await bootstrapSession(trace);
      cachedSession = s;
      return s;
    } finally {
      bootstrapInflight = null;
    }
  })();
  return bootstrapInflight;
}

function extractSetText(js: string, objId: string): string | null {
  const re = new RegExp(`${objId}\\.setText\\(\\s*["']([\\s\\S]*?)["']\\s*\\)`);
  const m = js.match(re);
  if (!m) return null;
  return m[1]
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .trim();
}

function looksLikeLoggedOut(js: string): boolean {
  return /login|sess[aã]o|expirad|_S_ID inv/i.test(js) && !/setText\(/i.test(js);
}

async function performLookup(session: Session, cpf: string, trace?: TraceStep[]): Promise<string> {
  const url = `${session.baseUrl}/ambulatorio/ambulatorio.dll/HandleEvent`;
  const referer = `${session.baseUrl}/ambulatorio/ambulatorio.dll/`;
  const cpfFmt = formatCpfMasked(cpf);
  const fpRaw = `%26O1162%3D%25024%2502%2502${encodeURIComponent(cpfFmt)}`;
  const r = await postHandleEvent(url, session.cookies, referer, {
    Ajax: "1",
    IsEvent: "1",
    Obj: "O117A",
    Evt: "click",
    this: "O117A",
    _S_ID: session.sId,
    _fp_: fpRaw,
    _seq_: String(seqCounter++),
    _uo_: "O112A",
  });
  const setTextCount = (r.text.match(/setText\(/g) ?? []).length;
  trace?.push({
    step: "POST lookup CPF",
    ok: setTextCount > 0,
    status: r.res.status,
    bodyLen: r.text.length,
    setCookies: r.setCookies,
    preview: maskPreview(r.text, [maskCpf(cpf)]),
    note: `setText() count=${setTextCount}`,
  });
  console.log("[opp] step=lookup", {
    cpf: maskCpf(cpf),
    status: r.res.status,
    bodyLen: r.text.length,
    setTextCount,
  });
  return r.text;
}

export type LookupOutput = { result: CadSusResult; trace: TraceStep[] };

export async function buscarPacienteCpfWithTrace(cpfInput: string): Promise<LookupOutput> {
  const trace: TraceStep[] = [];
  const cpf = cpfInput.replace(/\D/g, "");
  if (cpf.length !== 11) {
    return { result: { success: false, error: "cpf_nao_encontrado" }, trace };
  }

  let session: Session;
  try {
    session = await getSession(false, trace);
  } catch (err) {
    const code: ErrorCode = err instanceof OppError ? err.code : "rede";
    console.error("[opp] bootstrap_failed", {
      code,
      msg: err instanceof Error ? err.message : String(err),
      cpf: maskCpf(cpf),
    });
    return { result: { success: false, error: code }, trace };
  }

  let js: string;
  try {
    js = await performLookup(session, cpf, trace);
    if (looksLikeLoggedOut(js)) {
      cachedSession = null;
      trace.push({ step: "retry", ok: true, note: "sessão aparentemente expirada, refazendo login" });
      session = await getSession(true, trace);
      js = await performLookup(session, cpf, trace);
    }
  } catch (err) {
    const code: ErrorCode = err instanceof OppError ? err.code : "rede";
    console.error("[opp] lookup_failed", {
      code,
      msg: err instanceof Error ? err.message : String(err),
      cpf: maskCpf(cpf),
    });
    return { result: { success: false, error: code }, trace };
  }

  const setTextCount = (js.match(/setText\(/g) ?? []).length;
  if (setTextCount === 0) {
    return { result: { success: false, error: "lookup_sem_resposta" }, trace };
  }

  const endereco = extractSetText(js, "O11CB");
  const numero = extractSetText(js, "O11CF");
  const bairro = extractSetText(js, "O11D3");
  const cidadeRaw = extractSetText(js, "O11DB");
  const cns = extractSetText(js, "O11E3");
  const cnsSecundario = extractSetText(js, "O11E7");

  const allTexts: Array<{ id: string; value: string }> = [];
  const re = /(O[0-9A-F]+)\.setText\(\s*["']([\s\S]*?)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) {
    allTexts.push({
      id: m[1],
      value: m[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
    });
  }
  const telefone = allTexts.find((t) => /^\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/.test(t.value.trim()))?.value.trim() ?? null;
  const knownIds = new Set(["O11CB", "O11CF", "O11D3", "O11DB", "O11E3", "O11E7"]);
  const nomeCandidato = allTexts.find(
    (t) =>
      !knownIds.has(t.id) &&
      t.value.length >= 6 &&
      t.value.length <= 120 &&
      /\s/.test(t.value) &&
      /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+$/.test(t.value.trim()),
  );

  let cidade: string | null = null;
  let uf: string | null = null;
  if (cidadeRaw) {
    const parts = cidadeRaw.split("-").map((s) => s.trim());
    if (parts.length >= 2) {
      uf = parts[parts.length - 1].toUpperCase().slice(0, 2);
      cidade = parts.slice(0, -1).join("-");
    } else {
      cidade = cidadeRaw;
    }
  }

  if (!endereco && !cns && !nomeCandidato && !cidade) {
    trace.push({
      step: "parse",
      ok: false,
      note: `nenhum campo conhecido encontrado. setText IDs: ${allTexts
        .map((t) => t.id)
        .slice(0, 20)
        .join(",")}`,
    });
    return { result: { success: false, error: "cpf_nao_encontrado" }, trace };
  }

  return {
    result: {
      success: true,
      cpf,
      nome: nomeCandidato?.value.trim() ?? null,
      endereco,
      numero,
      bairro,
      cidade,
      uf,
      cns,
      cns_secundario: cnsSecundario,
      telefone,
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
