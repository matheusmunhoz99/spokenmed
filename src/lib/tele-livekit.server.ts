import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

function env() {
  const url = process.env.LIVEKIT_URL!;
  const apiKey = process.env.LIVEKIT_API_KEY!;
  const apiSecret = process.env.LIVEKIT_API_SECRET!;
  if (!url || !apiKey || !apiSecret) {
    throw new Error("LiveKit não configurado (LIVEKIT_URL/API_KEY/API_SECRET)");
  }
  // RoomServiceClient precisa do endpoint HTTPS, não WSS
  const httpUrl = url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  return { url, httpUrl, apiKey, apiSecret };
}

export type LkRole = "host" | "guest";

export async function generateLkToken(opts: {
  room: string;
  identity: string;
  name: string;
  role: LkRole;
  ttlSeconds?: number;
}): Promise<{ token: string; url: string }> {
  const { url, apiKey, apiSecret } = env();
  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: opts.ttlSeconds ?? 4 * 60 * 60,
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: opts.role === "host",
  });
  const token = await at.toJwt();
  return { token, url };
}

export async function deleteLkRoom(room: string): Promise<void> {
  const { httpUrl, apiKey, apiSecret } = env();
  try {
    const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    await svc.deleteRoom(room);
  } catch {
    // sala pode já não existir — sem erro pro caller
  }
}

export function makeRoomName(agendamentoId: string) {
  // remove hifens e prefixa pra ficar legível e único
  return `consulta-${agendamentoId.replace(/-/g, "").slice(0, 24)}`;
}
