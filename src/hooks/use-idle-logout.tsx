import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const IDLE_MS = 30 * 60 * 1000; // 30 min
const WARN_MS = 60 * 1000; // aviso 1 min antes

/** Faz logout após inatividade prolongada (mouse/teclado/touch/scroll). */
export function useIdleLogout() {
  const { user, signOut } = useAuth();
  const warnTimer = useRef<number | null>(null);
  const logoutTimer = useRef<number | null>(null);
  const warnedAt = useRef<number>(0);

  useEffect(() => {
    if (!user) return;

    const clearTimers = () => {
      if (warnTimer.current) window.clearTimeout(warnTimer.current);
      if (logoutTimer.current) window.clearTimeout(logoutTimer.current);
    };

    const reset = () => {
      clearTimers();
      warnTimer.current = window.setTimeout(() => {
        warnedAt.current = Date.now();
        toast.warning("Sua sessão será encerrada em 1 minuto por inatividade.", {
          duration: WARN_MS,
        });
      }, IDLE_MS - WARN_MS);
      logoutTimer.current = window.setTimeout(async () => {
        toast.error("Sessão encerrada por inatividade.");
        await signOut();
      }, IDLE_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel", "click"];
    const handler = () => reset();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearTimers();
    };
  }, [user, signOut]);
}
