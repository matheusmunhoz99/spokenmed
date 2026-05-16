import * as React from "react";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Transição suave entre rotas dentro de /app.
 * Mobile: slide + fade curtinho (cara de iOS).
 * Desktop: apenas fade discreto.
 */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div
      key={path}
      className={cn(
        "animate-in fade-in duration-300 ease-out",
        "motion-safe:slide-in-from-bottom-1 md:motion-safe:slide-in-from-bottom-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
