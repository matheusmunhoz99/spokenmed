import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Share, Plus } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 30;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS
    (window.navigator as any).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function recentlyDismissed() {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const at = parseInt(v, 10);
    if (!at) return false;
    return Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

export function InstallPwaPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || recentlyDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt as any);

    // iOS Safari não dispara beforeinstallprompt — mostrar dica
    if (isIos() && !isStandalone()) {
      // pequeno atraso para não brigar com a tela inicial
      const t = setTimeout(() => {
        setShowIos(true);
        setVisible(true);
      }, 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onPrompt as any);
      };
    }

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as any);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    } else {
      dismiss();
    }
    setDeferred(null);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-3 pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-xl ring-1 ring-black/5">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Instalar SpokenMED como app</div>
            {showIos ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Toque em <Share className="inline h-3.5 w-3.5 align-[-2px]" /> Compartilhar e depois em
                {" "}<Plus className="inline h-3.5 w-3.5 align-[-2px]" /> "Adicionar à Tela de Início" para abrir como aplicativo.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Tenha acesso rápido pelo ícone na tela inicial e abra em tela cheia, sem barra do navegador.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              {!showIos && (
                <Button size="sm" onClick={install} className="h-8 px-3 text-xs">
                  Instalar agora
                </Button>
              )}
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
