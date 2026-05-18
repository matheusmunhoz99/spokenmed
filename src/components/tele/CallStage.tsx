import "@livekit/components-styles";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useParticipants,
  useConnectionState,
  useRoomContext,
  ParticipantTile,
} from "@livekit/components-react";
import { ConnectionState, Track, type Room } from "livekit-client";
import {
  Loader2, Mic, MicOff, Video as VideoIcon, VideoOff,
  ScreenShare, ScreenShareOff, PhoneOff, RotateCcw, Wifi, WifiOff,
} from "lucide-react";

export type CallStageHandle = {
  leave: () => Promise<void>;
};

type Props = {
  url: string;              // wss://...livekit.cloud
  token: string;            // JWT LiveKit
  peerName?: string;
  selfName?: string;
  onLeft?: () => void;
  onJoined?: () => void;
  className?: string;
  recording?: boolean;
  topRight?: React.ReactNode;
  topLeft?: React.ReactNode;
  extraControls?: React.ReactNode;
};

export const CallStage = forwardRef<CallStageHandle, Props>(function CallStage(
  { url, token, peerName, selfName, onLeft, onJoined, className, recording, topRight, topLeft, extraControls },
  ref,
) {
  const roomRef = useRef<Room | null>(null);

  useImperativeHandle(ref, () => ({
    leave: async () => {
      try { await roomRef.current?.disconnect(); } catch {}
    },
  }));

  const [error, setError] = useState<string | null>(null);

  if (!token || !url) {
    return (
      <div className={`relative flex h-full w-full items-center justify-center bg-black text-white ${className || ""}`}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm opacity-70">Preparando chamada…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#0b0d10] text-white ${className || ""}`}>
      <LiveKitRoom
        serverUrl={url}
        token={token}
        connect={true}
        video={true}
        audio={true}
        onConnected={() => onJoined?.()}
        onDisconnected={() => onLeft?.()}
        onError={(e) => setError(e?.message || "Erro de conexão")}
        data-lk-theme="default"
        style={{ height: "100%", width: "100%", background: "transparent" }}
      >
        <RoomCapture roomRef={roomRef} />
        <RoomAudioRenderer />
        <Stage peerName={peerName} selfName={selfName} />
        <ConnectionOverlay />
        <TopBar topLeft={topLeft} topRight={topRight} recording={recording} />
        <Controls onLeave={() => roomRef.current?.disconnect()} extra={extraControls} />
      </LiveKitRoom>

      {error && (
        <div className="absolute inset-x-4 top-4 z-50 rounded-md bg-red-600/90 px-3 py-2 text-sm shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
});

/* ------------------------------ subcomponentes ------------------------------ */

function RoomCapture({ roomRef }: { roomRef: React.MutableRefObject<Room | null> }) {
  const room = useRoomContext();
  useEffect(() => { roomRef.current = room ?? null; }, [room, roomRef]);
  return null;
}

function Stage({ peerName, selfName }: { peerName?: string; selfName?: string }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const participants = useParticipants();
  const localId = useLocalParticipant().localParticipant?.identity;

  // sceeenshare tem prioridade absoluta
  const screen = tracks.find((t) => t.source === Track.Source.ScreenShare);
  const remoteCam = tracks.find(
    (t) => t.source === Track.Source.Camera && t.participant.identity !== localId,
  );
  const localCam = tracks.find(
    (t) => t.source === Track.Source.Camera && t.participant.identity === localId,
  );

  const main = screen || remoteCam || localCam;
  const pip = main === localCam ? null : localCam;

  return (
    <div className="absolute inset-0">
      {/* Vídeo principal */}
      {main ? (
        <ParticipantTile
          trackRef={main}
          disableSpeakingIndicator={false}
          className="!h-full !w-full !rounded-none [&_.lk-participant-metadata]:!hidden"
        />
      ) : (
        <WaitingForPeer peerName={peerName} />
      )}

      {/* Picture-in-picture do próprio vídeo */}
      {pip && (
        <div className="absolute bottom-24 right-4 z-30 h-32 w-24 overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/10 sm:bottom-28 sm:right-6 sm:h-44 sm:w-32">
          <ParticipantTile
            trackRef={pip}
            disableSpeakingIndicator
            className="!h-full !w-full !rounded-none [&_.lk-participant-metadata]:!hidden"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 text-[10px] font-medium">
            {selfName || "Você"}
          </div>
        </div>
      )}

      {/* Badge com nome do peer */}
      {main && main !== localCam && (
        <div className="pointer-events-none absolute bottom-24 left-4 z-30 rounded-full bg-black/50 px-3 py-1 text-xs font-medium backdrop-blur sm:bottom-28 sm:left-6">
          {main.participant.name || main.participant.identity}
        </div>
      )}

      {/* Contagem de participantes */}
      {participants.length > 2 && (
        <div className="absolute right-4 top-20 z-20 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium backdrop-blur">
          {participants.length} pessoas
        </div>
      )}
    </div>
  );
}

function WaitingForPeer({ peerName }: { peerName?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#0b0d10] via-[#11161d] to-[#0b0d10]">
      <div className="relative">
        <div className="absolute inset-0 -m-3 animate-ping rounded-full bg-emerald-400/20" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-3xl font-semibold shadow-2xl">
          {(peerName || "?").charAt(0).toUpperCase()}
        </div>
      </div>
      <div className="text-center">
        <p className="text-base font-medium">Aguardando {peerName || "o outro participante"}…</p>
        <p className="text-xs opacity-70">A chamada começa assim que ele entrar.</p>
      </div>
    </div>
  );
}

function ConnectionOverlay() {
  const state = useConnectionState();
  if (state === ConnectionState.Connected) return null;
  const map: Record<string, { icon: React.ReactNode; label: string }> = {
    [ConnectionState.Connecting]: { icon: <Loader2 className="h-6 w-6 animate-spin" />, label: "Conectando…" },
    [ConnectionState.Reconnecting]: { icon: <WifiOff className="h-6 w-6" />, label: "Reconectando…" },
    [ConnectionState.Disconnected]: { icon: <Wifi className="h-6 w-6" />, label: "Iniciando…" },
  };
  const info = map[state] || map[ConnectionState.Connecting];
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
      {info.icon}
      <p className="text-sm opacity-90">{info.label}</p>
    </div>
  );
}

function TopBar({ topLeft, topRight, recording }: { topLeft?: React.ReactNode; topRight?: React.ReactNode; recording?: boolean }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex items-center gap-3">{topLeft}</div>
        <div className="pointer-events-auto flex items-center gap-2">
          {recording && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide shadow-lg">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
            </span>
          )}
          {topRight}
        </div>
      </div>
    </>
  );
}

function Controls({ onLeave, extra }: { onLeave: () => void; extra?: React.ReactNode }) {
  const { localParticipant } = useLocalParticipant();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!localParticipant) return;
    setMicOn(localParticipant.isMicrophoneEnabled);
    setCamOn(localParticipant.isCameraEnabled);
    setScreenOn(localParticipant.isScreenShareEnabled);
  }, [localParticipant]);

  const toggle = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const switchCamera = async () => {
    if (!localParticipant) return;
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (!track || !("restartTrack" in track)) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      if (cams.length < 2) return;
      const current = (track as any).mediaStreamTrack?.getSettings?.().deviceId;
      const next = cams.find((c) => c.deviceId !== current) || cams[0];
      await (track as any).restartTrack({ deviceId: next.deviceId });
    } catch {}
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 pb-5 pt-4 sm:pb-7">
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-2 py-2 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          <CtrlBtn
            active={micOn}
            onClick={() => toggle(async () => {
              await localParticipant?.setMicrophoneEnabled(!micOn);
              setMicOn((v) => !v);
            })}
            title={micOn ? "Silenciar microfone" : "Ativar microfone"}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </CtrlBtn>

          <CtrlBtn
            active={camOn}
            onClick={() => toggle(async () => {
              await localParticipant?.setCameraEnabled(!camOn);
              setCamOn((v) => !v);
            })}
            title={camOn ? "Desligar câmera" : "Ligar câmera"}
          >
            {camOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </CtrlBtn>

          <CtrlBtn onClick={switchCamera} title="Trocar câmera">
            <RotateCcw className="h-5 w-5" />
          </CtrlBtn>

          <CtrlBtn
            active={screenOn}
            onClick={() => toggle(async () => {
              await localParticipant?.setScreenShareEnabled(!screenOn);
              setScreenOn((v) => !v);
            })}
            title={screenOn ? "Parar compartilhamento" : "Compartilhar tela"}
            className="hidden sm:inline-flex"
          >
            {screenOn ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
          </CtrlBtn>

          {extra}

          <button
            onClick={onLeave}
            title="Encerrar"
            className="ml-1 flex h-12 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700 active:scale-95"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );
}

function CtrlBtn({
  children, active, onClick, title, className,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  const base = "flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95";
  const variant = active === false
    ? "bg-red-600/90 text-white hover:bg-red-600"
    : "bg-white/15 text-white hover:bg-white/25";
  return (
    <button onClick={onClick} title={title} className={`${base} ${variant} ${className || ""}`}>
      {children}
    </button>
  );
}

/* ------------------------------ utilitários ------------------------------ */

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

export { CallStage as DailyCustomCall };
