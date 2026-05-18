import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import DailyIframe, { type DailyCall, type DailyParticipant } from "@daily-co/daily-js";
import { Mic, MicOff, Video, VideoOff, PhoneOff, ScreenShare, MonitorOff, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CallStageHandle = {
  leave: () => Promise<void>;
};

type Props = {
  url: string;
  token: string;
  peerName?: string;
  selfName?: string;
  onLeft?: () => void;
  onJoined?: () => void;
  className?: string;
  /** Render gravando dot na overlay */
  recording?: boolean;
  /** Slot extra no topo direito (ex: badge de status) */
  topRight?: React.ReactNode;
  /** Slot extra no topo esquerdo (ex: avatar+nome+timer) */
  topLeft?: React.ReactNode;
  /** Botões extras na barra inferior (ex: gravação) */
  extraControls?: React.ReactNode;
};

function VideoTile({
  participant,
  muted,
  mirror,
  className,
  fallbackName,
}: {
  participant: DailyParticipant | null;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
  fallbackName?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    const track = participant?.tracks?.video?.persistentTrack;
    if (v && track) {
      const stream = new MediaStream([track]);
      v.srcObject = stream;
      v.play().catch(() => {});
    } else if (v) {
      v.srcObject = null;
    }
  }, [participant?.tracks?.video?.persistentTrack]);

  useEffect(() => {
    if (muted) return;
    const a = audioRef.current;
    const track = participant?.tracks?.audio?.persistentTrack;
    if (a && track) {
      const stream = new MediaStream([track]);
      a.srcObject = stream;
      a.play().catch(() => {});
    } else if (a) {
      a.srcObject = null;
    }
  }, [participant?.tracks?.audio?.persistentTrack, muted]);

  const hasVideo = !!participant?.tracks?.video?.persistentTrack && participant.tracks.video.state === "playable";
  const name = participant?.user_name || fallbackName || "Participante";

  return (
    <div className={`relative h-full w-full overflow-hidden bg-zinc-900 ${className || ""}`}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full object-cover ${mirror ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black text-white">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 ring-4 ring-white/10 backdrop-blur">
            <UserRound className="h-12 w-12" />
          </div>
          <div className="text-sm font-medium opacity-80">{name}</div>
          <div className="text-xs opacity-50">Câmera desligada</div>
        </div>
      )}
      {!muted && <audio ref={audioRef} autoPlay />}
    </div>
  );
}

export const CallStage = forwardRef<CallStageHandle, Props>(function CallStage(
  { url, token, peerName, selfName, onLeft, onJoined, className, recording, topRight, topLeft, extraControls },
  ref,
) {
  const callRef = useRef<DailyCall | null>(null);
  const [local, setLocal] = useState<DailyParticipant | null>(null);
  const [remotes, setRemotes] = useState<DailyParticipant[]>([]);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);

  useImperativeHandle(ref, () => ({
    leave: async () => {
      try { await callRef.current?.leave(); } catch (_) {}
    },
  }));

  useEffect(() => {
    if (callRef.current) return;
    let cancelled = false;

    const call = DailyIframe.createCallObject({
      audioSource: true,
      videoSource: true,
      dailyConfig: { useDevicePreferenceCookies: true },
    });
    callRef.current = call;

    const sync = () => {
      const parts = call.participants();
      const loc = parts.local || null;
      const rem = Object.values(parts).filter((p: any) => p.session_id !== loc?.session_id) as DailyParticipant[];
      setLocal(loc);
      setRemotes(rem);
      if (loc) {
        setMicOn(loc.audio);
        setCamOn(loc.video);
        setSharing(!!loc.screen);
      }
    };

    call.on("joined-meeting", () => { if (!cancelled) { setJoined(true); onJoined?.(); } sync(); });
    call.on("participant-joined", sync);
    call.on("participant-updated", sync);
    call.on("participant-left", sync);
    call.on("track-started", sync);
    call.on("track-stopped", sync);
    call.on("left-meeting", () => onLeft?.());
    call.on("error", (e: any) => setError(e?.errorMsg || e?.error || "Erro na chamada"));

    call.join({ url, token, userName: selfName }).catch((e: any) => setError(e?.message || String(e)));

    return () => {
      cancelled = true;
      try { call.leave(); } catch (_) {}
      try { call.destroy(); } catch (_) {}
      callRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token]);

  const toggleMic = async () => {
    const next = !micOn;
    await callRef.current?.setLocalAudio(next);
    setMicOn(next);
  };
  const toggleCam = async () => {
    const next = !camOn;
    await callRef.current?.setLocalVideo(next);
    setCamOn(next);
  };
  const toggleShare = async () => {
    if (!callRef.current) return;
    if (sharing) await callRef.current.stopScreenShare();
    else await callRef.current.startScreenShare();
  };
  const hangup = async () => {
    try { await callRef.current?.leave(); } catch (_) {}
  };

  const remote = remotes[0] || null;

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-2xl bg-black text-white shadow-2xl ${className || ""}`}>
      {/* Remote (palco principal) */}
      <div className="absolute inset-0">
        <VideoTile participant={remote} fallbackName={peerName} />
      </div>

      {/* Overlay gradient topo */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/70 to-transparent" />
      {/* Overlay gradient base */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Header */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-3">{topLeft}</div>
        <div className="flex items-center gap-2">
          {recording && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide shadow-lg">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
            </span>
          )}
          {topRight}
        </div>
      </div>

      {/* Local PiP */}
      {local && (
        <div className="absolute right-3 top-16 z-20 h-32 w-24 overflow-hidden rounded-xl ring-2 ring-white/30 shadow-2xl sm:right-4 sm:top-20 sm:h-44 sm:w-32">
          <VideoTile participant={local} muted mirror fallbackName={selfName} />
          {!micOn && (
            <div className="absolute bottom-1 left-1 rounded-full bg-red-600 p-1 shadow">
              <MicOff className="h-3 w-3" />
            </div>
          )}
        </div>
      )}

      {/* Estados */}
      {!joined && !error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm opacity-80">Conectando à chamada…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/80 p-6 text-center">
          <p className="text-sm text-red-300">{error}</p>
          <p className="text-xs opacity-70">Verifique permissões de câmera/microfone do navegador.</p>
        </div>
      )}
      {joined && remotes.length === 0 && (
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-black/40 px-5 py-3 text-center backdrop-blur">
          <p className="text-sm font-medium">Aguardando {peerName || "o outro participante"} entrar…</p>
        </div>
      )}

      {/* Controles base */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-2 p-3 sm:gap-3 sm:p-5">
        <button
          onClick={toggleMic}
          title={micOn ? "Silenciar" : "Ativar microfone"}
          className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition active:scale-95 ${micOn ? "bg-white/15 hover:bg-white/25" : "bg-red-600 hover:bg-red-700"}`}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          onClick={toggleCam}
          title={camOn ? "Desligar câmera" : "Ligar câmera"}
          className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition active:scale-95 ${camOn ? "bg-white/15 hover:bg-white/25" : "bg-red-600 hover:bg-red-700"}`}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>
        <button
          onClick={toggleShare}
          title={sharing ? "Parar compartilhamento" : "Compartilhar tela"}
          className={`hidden h-12 w-12 items-center justify-center rounded-full backdrop-blur transition active:scale-95 sm:flex ${sharing ? "bg-sky-600 hover:bg-sky-700" : "bg-white/15 hover:bg-white/25"}`}
        >
          {sharing ? <MonitorOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
        </button>
        {extraControls}
        <button
          onClick={hangup}
          title="Encerrar chamada"
          className="flex h-12 items-center gap-2 rounded-full bg-red-600 px-5 font-medium shadow-lg transition hover:bg-red-700 active:scale-95"
        >
          <PhoneOff className="h-5 w-5" /> Encerrar
        </button>
      </div>
    </div>
  );
});

export function CallDurationBadge({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return null;
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const txt = hh > 0
    ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return (
    <span className="rounded-full bg-emerald-600/90 px-2.5 py-1 text-[11px] font-semibold tabular-nums shadow-lg">
      {txt}
    </span>
  );
}

// Re-export for legacy imports
export { CallStage as DailyCustomCall };
