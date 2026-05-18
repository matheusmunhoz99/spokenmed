import { useEffect, useRef, useState } from "react";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";

type Props = {
  url: string;
  token: string;
  onLeft?: () => void;
  showOwnerControls?: boolean;
};

export function DailyEmbed({ url, token, onLeft }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const callRef = useRef<DailyCall | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    if (callRef.current) return;
    try {
      const call = DailyIframe.createFrame(wrapRef.current, {
        showLeaveButton: true,
        iframeStyle: {
          width: "100%",
          height: "100%",
          border: "0",
          borderRadius: "12px",
          background: "#000",
        },
      });
      callRef.current = call;
      call.on("left-meeting", () => onLeft?.());
      call.join({ url, token }).catch((e: any) => setError(e?.message || String(e)));
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    return () => {
      try { callRef.current?.leave(); } catch (_) { /* */ }
      try { callRef.current?.destroy(); } catch (_) { /* */ }
      callRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token]);

  return (
    <div className="relative h-full w-full">
      <div ref={wrapRef} className="h-full w-full rounded-xl bg-black" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
