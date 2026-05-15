// Server-only client for the Fiorilli/OPP system.
// SECURITY: Never import this file from client code. Credentials, cookies and
// session IDs live exclusively in the server runtime.

type CookieJar = Map<string, string>;

type Session = {
  baseUrl: string;
  cookies: CookieJar;
  sId: string;
  ambulatorioReady: boolean;
  createdAt: number;
};

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 min
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
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

function ingestSetCookies(res: Response, jar: CookieJar) {
  // In Workers/undici, multiple Set-Cookie headers are joined by getSetCookie()
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const list: string[] = typeof anyHeaders.getSetCookie === "function"
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

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal, redirect: "manual" });
  } finally {
    clearTimeout(t);
  }
}

function extractSId(text: string): string | null {
  // Try several patterns the Fiorilli/OPP UI uses to embed the session id.
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
  const u = m[1];
  const tokenMatch = u.match(/[?&]user=([^&"']+)/);
  return tokenMatch ? tokenMatch[1] : null;
}

function getEnv(): { baseUrl: string; user: string; pass: string } {
  const baseUrl = (process.env.OPP_BASE_URL ?? "").replace(/\/+$/, "");
  const user = process.env.OPP_USERNAME ?? "";
  const pass = process.env.OPP_PASSWORD ?? "";
  if (!baseUrl || !user || !pass) {
    throw new Error("opp_env_missing");
  }
  return { baseUrl, user, pass };
}

function commonHeaders(jar: CookieJar, referer: string): HeadersInit {
  const h: Record<string, string> = {
    "Accept": "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (compatible; SpokenMED/1.0)",
    "Referer": referer,
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
): Promise<{ res: Response; text: string }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) params.set(k, v);
  const res = await timedFetch(url, {
    method: "POST",
    headers: {
      ...commonHeaders(jar, referer),
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: params.toString(),
  });
  ingestSetCookies(res, jar);
  const text = await res.text();
  return { res, text };
}

async function bootstrapSession(): Promise<Session> {
  const { baseUrl, user, pass } = getEnv();
  const jar: CookieJar = new Map();

  // 1) GET /sis/ to seed cookies + initial _S_ID
  const sisIndex = `${baseUrl}/sis/`;
  const indexRes = await timedFetch(sisIndex, { headers: commonHeaders(jar, baseUrl) });
  ingestSetCookies(indexRes, jar);
  const indexHtml = await indexRes.text();
  let sId = extractSId(indexHtml);
  if (!sId) throw new Error("opp_session_seed_failed");

  const sisHandle = `${baseUrl}/sis/sis.dll/HandleEvent`;

  // 2) Fill username (Obj=O30, change), then password (Obj=O34, change), then click login (Obj=O40, click)
  const baseFields = { Ajax: "1", IsEvent: "1", _S_ID: sId };

  await postHandleEvent(sisHandle, jar, sisIndex, {
    ...baseFields,
    Obj: "O30",
    Evt: "change",
    this: "O30",
    fp: `&O30=${encodeURIComponent(user)}`,
    seq: String(seqCounter++),
  });

  await postHandleEvent(sisHandle, jar, sisIndex, {
    ...baseFields,
    Obj: "O34",
    Evt: "change",
    this: "O34",
    fp: `&O34=${encodeURIComponent(pass)}`,
    seq: String(seqCounter++),
  });

  const { text: loginJs } = await postHandleEvent(sisHandle, jar, sisIndex, {
    ...baseFields,
    Obj: "O40",
    Evt: "click",
    this: "O40",
    fp: `&O30=${encodeURIComponent(user)}&O34=${encodeURIComponent(pass)}`,
    seq: String(seqCounter++),
  });

  const token = extractAmbulatorioToken(loginJs);
  if (!token) {
    console.error("[opp] login_failed: no ambulatorio token in response", {
      preview: loginJs.slice(0, 300).replace(/[?&]_S_ID=[^&"']+/g, "&_S_ID=***"),
    });
    throw new Error("opp_login_failed");
  }

  // 3) Open ambulatorio with token to upgrade session
  const ambUrl = `${baseUrl}/ambulatorio/ambulatorio.dll/?user=${encodeURIComponent(token)}`;
  const ambRes = await timedFetch(ambUrl, { headers: commonHeaders(jar, sisIndex) });
  ingestSetCookies(ambRes, jar);
  const ambHtml = await ambRes.text();
  const ambSid = extractSId(ambHtml) ?? sId;

  return {
    baseUrl,
    cookies: jar,
    sId: ambSid,
    ambulatorioReady: true,
    createdAt: Date.now(),
  };
}

async function getSession(force = false): Promise<Session> {
  if (!force && cachedSession && Date.now() - cachedSession.createdAt < SESSION_TTL_MS) {
    return cachedSession;
  }
  if (bootstrapInflight) return bootstrapInflight;
  bootstrapInflight = (async () => {
    try {
      const s = await bootstrapSession();
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
  | { success: false; error: "cpf_nao_encontrado" | "fiorilli_indisponivel" | "config_ausente" };

async function performLookup(session: Session, cpf: string): Promise<string> {
  const url = `${session.baseUrl}/ambulatorio/ambulatorio.dll/HandleEvent`;
  const referer = `${session.baseUrl}/ambulatorio/ambulatorio.dll/`;
  const cpfFmt = formatCpfMasked(cpf);
  // The CPF input is named O1162. The fp field encodes &O1162=<chr 02><chr 02><CPF>
  // (control chars come from how the OPP form serializes value+display).
  const fpRaw = `&O1162=\x02\x02${cpfFmt}`;
  const { text } = await postHandleEvent(url, session.cookies, referer, {
    Ajax: "1",
    IsEvent: "1",
    Obj: "O117A",
    Evt: "click",
    this: "O117A",
    _S_ID: session.sId,
    fp: fpRaw,
    seq: String(seqCounter++),
    uo: "O112A",
  });
  return text;
}

export async function buscarPacienteCpf(cpfInput: string): Promise<CadSusResult> {
  const cpf = cpfInput.replace(/\D/g, "");
  if (cpf.length !== 11) return { success: false, error: "cpf_nao_encontrado" };

  let session: Session;
  try {
    session = await getSession();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "opp_env_missing") return { success: false, error: "config_ausente" };
    console.error("[opp] bootstrap error", { msg, cpf: maskCpf(cpf) });
    return { success: false, error: "fiorilli_indisponivel" };
  }

  let js: string;
  try {
    js = await performLookup(session, cpf);
    if (looksLikeLoggedOut(js)) {
      // session expired — refresh and retry once
      cachedSession = null;
      session = await getSession(true);
      js = await performLookup(session, cpf);
    }
  } catch (err) {
    console.error("[opp] lookup error", {
      msg: err instanceof Error ? err.message : String(err),
      cpf: maskCpf(cpf),
    });
    return { success: false, error: "fiorilli_indisponivel" };
  }

  const endereco = extractSetText(js, "O11CB");
  const numero = extractSetText(js, "O11CF");
  const bairro = extractSetText(js, "O11D3");
  const cidadeRaw = extractSetText(js, "O11DB");
  const cns = extractSetText(js, "O11E3");
  const cnsSecundario = extractSetText(js, "O11E7");

  // Heurística: nome / telefone — varremos os outros setText
  const allTexts: Array<{ id: string; value: string }> = [];
  const re = /(O[0-9A-F]+)\.setText\(\s*["']([\s\S]*?)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) {
    allTexts.push({ id: m[1], value: m[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) });
  }
  // Telefone: valor que parece telefone brasileiro
  const telefone = allTexts.find((t) => /^\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/.test(t.value.trim()))?.value.trim() ?? null;
  // Nome: string longa, em maiúsculas, com espaço, que não é endereço/cidade/cns
  const knownIds = new Set(["O11CB", "O11CF", "O11D3", "O11DB", "O11E3", "O11E7"]);
  const nomeCandidato = allTexts.find((t) =>
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

  // Se não veio nada de nada, considera não encontrado
  if (!endereco && !cns && !nomeCandidato && !cidade) {
    return { success: false, error: "cpf_nao_encontrado" };
  }

  return {
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
  };
}
