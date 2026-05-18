// Server-only Daily.co REST helpers. Never import from client code.
const DAILY_API = "https://api.daily.co/v1";

function getKey() {
  const k = process.env.DAILY_API_KEY;
  if (!k) throw new Error("DAILY_API_KEY não configurada");
  return k;
}

async function dailyFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${DAILY_API}${path}`, {
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
    const msg = typeof body === "object" && body?.error ? body.error : (body?.info || text || res.statusText);
    throw new Error(`Daily ${path} ${res.status}: ${msg}`);
  }
  return body;
}

export async function createRoom(opts: { name: string; expSeconds: number; enableRecording?: boolean }) {
  return dailyFetch("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: opts.name,
      privacy: "private",
      properties: {
        exp: Math.floor(Date.now() / 1000) + opts.expSeconds,
        enable_chat: true,
        enable_screenshare: true,
        enable_recording: opts.enableRecording ? "cloud" : undefined,
        eject_at_room_exp: true,
      },
    }),
  });
}

export async function createMeetingToken(opts: {
  roomName: string; userName: string; isOwner: boolean; expSeconds: number;
}) {
  return dailyFetch("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: opts.roomName,
        user_name: opts.userName,
        is_owner: opts.isOwner,
        exp: Math.floor(Date.now() / 1000) + opts.expSeconds,
      },
    }),
  });
}

export async function startRecording(roomName: string) {
  return dailyFetch(`/rooms/${roomName}/recordings/start`, { method: "POST", body: "{}" });
}

export async function stopRecording(roomName: string) {
  return dailyFetch(`/rooms/${roomName}/recordings/stop`, { method: "POST", body: "{}" });
}

export async function listRecordings(roomName: string) {
  return dailyFetch(`/recordings?room_name=${encodeURIComponent(roomName)}&limit=5`);
}

export async function getRecordingAccessLink(id: string) {
  return dailyFetch(`/recordings/${id}/access-link`);
}
