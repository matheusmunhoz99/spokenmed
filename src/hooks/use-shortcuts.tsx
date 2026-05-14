import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

type Ctx = { helpOpen: boolean; setHelpOpen: (v: boolean) => void };
const ShortcutsCtx = createContext<Ctx>({ helpOpen: false, setHelpOpen: () => {} });

export const SHORTCUTS = [
  { keys: "g i", label: "Ir para o Painel" },
  { keys: "g a", label: "Ir para a Agenda do Dia" },
  { keys: "g f", label: "Ir para a Fila" },
  { keys: "g p", label: "Ir para Pacientes" },
  { keys: "g r", label: "Ir para Relatórios" },
  { keys: "g s", label: "Ir para Profissionais" },
  { keys: "n", label: "Novo agendamento" },
  { keys: "/", label: "Focar busca da página" },
  { keys: "?", label: "Mostrar/ocultar atalhos" },
  { keys: "Esc", label: "Fechar diálogos" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();

  const goto = useCallback((to: string) => navigate({ to }), [navigate]);

  useEffect(() => {
    let leader = false;
    let leaderTimer: number | null = null;
    const clearLeader = () => {
      leader = false;
      if (leaderTimer) window.clearTimeout(leaderTimer);
      leaderTimer = null;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = isTypingTarget(e.target);

      // ? always opens help (even while typing? no — skip when typing)
      if (!typing && (e.key === "?" || (e.key === "/" && e.shiftKey))) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      // / focuses search input
      if (!typing && e.key === "/") {
        const el = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[data-shortcut-search], input[placeholder*="uscar" i], input[placeholder*="ome" i]',
        );
        if (el) {
          e.preventDefault();
          el.focus();
          el.select();
          return;
        }
      }

      if (typing) return;

      if (leader) {
        clearLeader();
        switch (e.key.toLowerCase()) {
          case "i": e.preventDefault(); goto("/app"); return;
          case "a": e.preventDefault(); goto("/app/agenda-dia"); return;
          case "f": e.preventDefault(); goto("/app/fila"); return;
          case "p": e.preventDefault(); goto("/app/pacientes"); return;
          case "r": e.preventDefault(); goto("/app/relatorios"); return;
          case "s": e.preventDefault(); goto("/app/profissionais"); return;
          default: return;
        }
      }

      if (e.key.toLowerCase() === "g") {
        leader = true;
        if (leaderTimer) window.clearTimeout(leaderTimer);
        leaderTimer = window.setTimeout(clearLeader, 1200);
        return;
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        goto("/app/agendar");
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (leaderTimer) window.clearTimeout(leaderTimer);
    };
  }, [goto]);

  return <ShortcutsCtx.Provider value={{ helpOpen, setHelpOpen }}>{children}</ShortcutsCtx.Provider>;
}

export function useShortcutsHelp() {
  return useContext(ShortcutsCtx);
}
