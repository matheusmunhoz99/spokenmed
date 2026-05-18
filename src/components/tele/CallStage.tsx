import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

// Carrega o web component <whereby-embed> uma única vez no client.
let wherebyLoaded = false;
async function ensureWherebyEmbed() {
  if (wherebyLoaded) return;
  // import dinâmico — só roda no browser
  await import("@whereby.com/browser-sdk/embed");
  wherebyLoaded = true;
}

// Tipagem mínima do elemento custom <whereby-embed>
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "whereby-embed": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          room?: string;
          displayName?: string;
          minimal?: string;
          chat?: "on" | "off";
          people?: "on" | "off";
          leaveButton?: "on" | "off";
          screenshare?: "on" | "off";
          background?: "on" | "off";
          logo?: "on" | "off";
          floatSelf?: "on" | "off";
          audio?: "on" | "off";
          video?: "on" | "off";
          subgridLabels?: "on" | "off";
          settingsButton?: "on" | "off";
          moreButton?: "on" | "off";
        },
        HTMLElement
      >;
    }
  }
}

export type CallStageHandle = {
  leave: () => Promise<void>;
};

type Props = {
  url: string;
  token?: string; // ignorado no Whereby (URL já é assinada)
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
  { url, selfName, onLeft, onJoined, className, recording, topRight, topLeft },
  ref,
) {
  const embedRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    leave: async () => {
      try { (embedRef.current as any)?.endMeeting?.(); } catch (_) {}
    },
  }));

  useEffect(() => {
    let cancelled = false;
    ensureWherebyEmbed()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((e) => setError(e?.message || "Falha ao carregar o vídeo"));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = embedRef.current;
    if (!el || !ready) return;
    const handleJoin = () => onJoined?.();
    const handleLeave = () => onLeft?.();
    el.addEventListener("ready", handleJoin as any);
    el.addEventListener("join", handleJoin as any);
    el.addEventListener("leave", handleLeave as any);
    return () => {
      el.removeEventListener("ready", handleJoin as any);
      el.removeEventListener("join", handleJoin as any);
      el.removeEventListener("leave", handleLeave as any);
    };
  }, [ready, onJoined, onLeft]);

  // Anexa parâmetros úteis ao URL (displayName, autoavailable)
  const roomUrl = (() => {
    try {
      const u = new URL(url);
      if (selfName) u.searchParams.set("displayName", selfName);
      // Embedded API params
      u.searchParams.set("embed", "true");
      return u.toString();
    } catch {
      return url;
    }
  })();

  return (
    <div className={`relative h-full w-full overflow-hidden bg-black text-white ${className || ""}`}>
      {/* Embed do Whereby ocupa tudo */}
      {ready ? (
        <whereby-embed
          ref={embedRef as any}
          room={roomUrl}
          displayName={selfName}
          background="off"
          logo="off"
          chat="off"
          people="off"
          floatSelf="on"
          subgridLabels="on"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      ) : !error ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm opacity-80">Conectando à chamada…</p>
        </div>
      ) : (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/80 p-6 text-center">
          <p className="text-sm text-red-300">{error}</p>
          <p className="text-xs opacity-70">Verifique sua conexão e tente novamente.</p>
        </div>
      )}

      {/* Overlays de header — não interceptam cliques nos controles do Whereby */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-gradient-to-b from-black/60 to-transparent" />
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

export { CallStage as DailyCustomCall };
