// Server-only Whereby Embedded API helpers. Never import from client code.
// Docs: https://docs.whereby.com/reference/whereby-rest-api-reference
const WHEREBY_API = "https://api.whereby.dev/v1";

function getKey() {
  const k = process.env.WHEREBY_API_KEY;
  if (!k) throw new Error("WHEREBY_API_KEY não configurada");
  return k;
}

async function wherebyFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${WHEREBY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === "object" && body ? (body.message || body.error || JSON.stringify(body)) : text || res.statusText;
    throw new Error(`Whereby ${path} ${res.status}: ${msg}`);
  }
  return body;
}

export type WherebyMeeting = {
  meetingId: string;
  roomUrl: string;
  hostRoomUrl: string;
  roomName: string;
  endDate: string;
};

export async function createMeeting(opts: { endsInSeconds: number; roomNamePrefix?: string }): Promise<WherebyMeeting> {
  const endDate = new Date(Date.now() + opts.endsInSeconds * 1000).toISOString();
  const body: Record<string, any> = {
    endDate,
    roomMode: "normal", // 1:1 — também aceita "group"
    fields: ["hostRoomUrl"],
  };
  const r = await wherebyFetch("/meetings", { method: "POST", body: JSON.stringify(body) });
  return {
    meetingId: r.meetingId,
    roomUrl: r.roomUrl,
    hostRoomUrl: r.hostRoomUrl,
    roomName: r.roomName,
    endDate: r.endDate,
  };
}

export async function deleteMeeting(meetingId: string) {
  try {
    await wherebyFetch(`/meetings/${meetingId}`, { method: "DELETE" });
  } catch (_) {
    // ignora erros (reunião já expirada/removida)
  }
}
