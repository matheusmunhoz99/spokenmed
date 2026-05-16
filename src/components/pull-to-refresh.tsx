import * as React from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { haptic } from "@/hooks/use-haptics";
import { cn } from "@/lib/utils";

interface Props {
  onRefresh: () => void | Promise<unknown>;
  children: React.ReactNode;
  /** distance in px the user has to pull before refresh triggers */
  threshold?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * Pull-to-refresh para listas/páginas mobile.
 * Só ativa no mobile e quando o scroll do documento está no topo.
 */
export function PullToRefresh({ onRefresh, children, threshold = 70, className, disabled }: Props) {
  const isMobile = useIsMobile();
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const startY = React.useRef<number | null>(null);
  const active = React.useRef(false);

  React.useEffect(() => {
    if (!isMobile || disabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      // só inicia se a janela está no topo
      const top = window.scrollY || document.documentElement.scrollTop || 0;
      if (top > 2) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!active.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // resistência: divide por 2
      const next = Math.min(dy / 2, threshold * 1.6);
      setPull(next);
    };
    const onTouchEnd = async () => {
      if (!active.current) return;
      active.current = false;
      startY.current = null;
      if (pull >= threshold && !refreshing) {
        setRefreshing(true);
        setPull(threshold);
        haptic("light");
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isMobile, disabled, onRefresh, pull, refreshing, threshold]);

  const progress = Math.min(pull / threshold, 1);
  const showIndicator = isMobile && (pull > 4 || refreshing);

  return (
    <div className={cn("relative", className)}>
      {showIndicator && (
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 transition-transform"
          style={{ transform: `translate(-50%, ${Math.max(pull - 28, -28)}px)` }}
          aria-hidden
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-md"
            style={{ opacity: 0.4 + progress * 0.6 }}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <ArrowDown
                className="h-4 w-4 text-primary transition-transform"
                style={{ transform: `rotate(${progress >= 1 ? 180 : 0}deg)` }}
              />
            )}
          </div>
        </div>
      )}
      <div
        style={
          isMobile && !refreshing
            ? { transform: `translateY(${pull}px)`, transition: pull === 0 ? "transform 220ms ease-out" : "none" }
            : isMobile && refreshing
              ? { transform: `translateY(${threshold * 0.6}px)`, transition: "transform 220ms ease-out" }
              : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
