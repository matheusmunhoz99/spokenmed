import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

const POLL_MS = 2 * 60 * 1000; // checa a cada 2 minutos
const DISMISS_KEY = "update-banner-dismissed-build";

async function fetchBuildId(): Promise<string | null> {
  try {
    const res = await fetch("/api/public/version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { buildId?: string };
    return data.buildId ?? null;
  } catch {
    return null;
  }
}

export function UpdateAvailableBanner() {
  const initialBuildId = useRef<string | null>(null);
  const [newBuildId, setNewBuildId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      const current = await fetchBuildId();
      if (cancelled || !current) return;

      // Primeira chamada: guarda a versão atual como baseline.
      if (initialBuildId.current === null) {
        initialBuildId.current = current;
        return;
      }

      if (current !== initialBuildId.current) {
        // Respeita "Agora não" para esta build específica.
        try {
          const dismissed = localStorage.getItem(DISMISS_KEY);
          if (dismissed === current) return;
        } catch {}
        setNewBuildId(current);
      }
    };

    void check();
    timer = setInterval(check, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const reload = () => {
    // Force reload sem cache.
    window.location.reload();
  };

  const dismiss = () => {
    try {
      if (newBuildId) localStorage.setItem(DISMISS_KEY, newBuildId);
    } catch {}
    setNewBuildId(null);
  };

  if (!newBuildId) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-3 pointer-events-none"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-xl ring-1 ring-black/5">
        <div className="flex items-start gap-3 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Nova versão disponível</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Toque em atualizar para carregar a versão mais recente do SpokenMED.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={reload} className="h-8 px-3 text-xs">
                Atualizar agora
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss} className="h-8 px-3 text-xs">
                Agora não
              </Button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={dismiss}
            className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
