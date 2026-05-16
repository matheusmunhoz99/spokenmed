// Server-only client for the external spokenmed Worker.
// All Puppeteer/uniGUI logic lives in the Worker — this file only does HTTP.

export type TraceStep = {
  step: string;
  ok: boolean;
  status?: number;
  bodyLen?: number;
  preview?: string;
  note?: string;
};

export type ErrorCode =
  | "config_ausente"
  | "browser_indisponivel"
  | "login_invalido"
  | "lookup_sem_resposta"
  | "cpf_nao_encontrado"
  | "timeout"
  | "rede"
  | "unauthorized"
  | "sessao_ausente"
  | "sessao_expirada"
  | "grid_invalida";

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
        cep: string | null;
        cns: string | null;
        cns_secundario: string | null;
        telefone: string | null;
        data_nascimento: string | null;
        sexo: string | null;
        nome_mae: string | null;
        nome_pai: string | null;
      };
    }
  | { ok: false; error: ErrorCode };

export type LookupOutput = { result: CadSusResult; trace: TraceStep[] };

const REQUEST_TIMEOUT_MS = 60_000; // worker pode demorar no bootstrap inicial

function maskCpf(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return "***";
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

function maskPreview(text: string): string {
  return text.slice(0, 600);
}

function getWorkerConfig(): { url: string; apiKey: string } | null {
  const url = (process.env.CADSUS_WORKER_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.CADSUS_WORKER_API_KEY ?? "";
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

export async function buscarPacienteCpfWithTrace(cpfInput: string): Promise<LookupOutput> {
  const trace: TraceStep[] = [];
  const cpf = cpfInput.replace(/\D/g, "");
  if (cpf.length !== 11) {
    return { result: { ok: false, error: "cpf_nao_encontrado" }, trace };
  }

  const cfg = getWorkerConfig();
  if (!cfg) {
    trace.push({
      step: "config",
      ok: false,
      note: "CADSUS_WORKER_URL ou CADSUS_WORKER_API_KEY ausentes",
    });
    return { result: { ok: false, error: "config_ausente" }, trace };
  }

  const endpoint = `${cfg.url}/cpf?cpf=${cpf}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  let text = "";
  try {
    res = await fetch(endpoint, {
      method: "GET",
      signal: ac.signal,
      headers: {
        "x-api-key": cfg.apiKey,
        Accept: "application/json",
      },
    });
    text = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.toLowerCase().includes("abort");
    trace.push({
      step: "http.worker",
      ok: false,
      note: msg,
    });
    console.error("[opp] worker fetch failed", { cpf: maskCpf(cpf), msg });
    return { result: { ok: false, error: isTimeout ? "timeout" : "rede" }, trace };
  } finally {
    clearTimeout(t);
  }

  trace.push({
    step: "http.worker",
    ok: res.status === 200,
    status: res.status,
    bodyLen: text.length,
    preview: maskPreview(text),
  });
  console.log("[opp] worker response", {
    cpf: maskCpf(cpf),
    status: res.status,
    bodyLen: text.length,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    trace.push({ step: "parse.json", ok: false, note: "resposta não-JSON do worker" });
    return { result: { ok: false, error: "rede" }, trace };
  }

  if (res.status === 401) {
    return { result: { ok: false, error: "unauthorized" }, trace };
  }

  // Worker já devolve o shape que precisamos: { ok, dados } ou { ok:false, error }
  if (parsed && typeof parsed === "object") {
    return { result: parsed as CadSusResult, trace };
  }

  return { result: { ok: false, error: "rede" }, trace };
}

export async function buscarPacienteCpf(cpfInput: string): Promise<CadSusResult> {
  const { result } = await buscarPacienteCpfWithTrace(cpfInput);
  return result;
}

export function clearOppSessionCache() {
  // No-op: sessão é gerenciada pelo Worker (Durable Object).
  // Mantido pra compatibilidade com cadsus-diag.functions.ts.
}
