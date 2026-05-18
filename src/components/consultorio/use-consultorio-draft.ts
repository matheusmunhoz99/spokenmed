import { useEffect, useRef, useState } from "react";

const KEY_PREFIX = "consultorio-draft:";
const AUTOSAVE_MS = 15_000;

export type ConsultorioDraft = {
  v: 1;
  savedAt: number;
  data: Record<string, unknown>;
};

function key(agendamentoId: string) {
  return `${KEY_PREFIX}${agendamentoId}`;
}

export function loadDraft(agendamentoId: string): ConsultorioDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(agendamentoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsultorioDraft;
    if (parsed?.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(agendamentoId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(agendamentoId));
  } catch {
    /* ignore */
  }
}

/**
 * Auto-save de rascunho em localStorage.
 * - `getSnapshot` é chamado a cada AUTOSAVE_MS (timer) e em hooks de blur/visibility/keydown manuais.
 * - `enabled = false` desliga o ciclo (ex.: durante envio/finalização).
 */
export function useConsultorioAutoSave({
  agendamentoId,
  getSnapshot,
  enabled,
}: {
  agendamentoId: string | undefined;
  getSnapshot: () => Record<string, unknown>;
  enabled: boolean;
}) {
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const lastJsonRef = useRef<string>("");

  const save = useRef(() => {
    if (!agendamentoId || !enabled) return false;
    try {
      const data = getSnapshot();
      const json = JSON.stringify(data);
      if (json === lastJsonRef.current) return false;
      const payload: ConsultorioDraft = { v: 1, savedAt: Date.now(), data };
      localStorage.setItem(key(agendamentoId), JSON.stringify(payload));
      lastJsonRef.current = json;
      setLastSavedAt(payload.savedAt);
      return true;
    } catch {
      return false;
    }
  });
  // mantém a closure atualizada
  save.current = () => {
    if (!agendamentoId || !enabled) return false;
    try {
      const data = getSnapshot();
      const json = JSON.stringify(data);
      if (json === lastJsonRef.current) return false;
      const payload: ConsultorioDraft = { v: 1, savedAt: Date.now(), data };
      localStorage.setItem(key(agendamentoId), JSON.stringify(payload));
      lastJsonRef.current = json;
      setLastSavedAt(payload.savedAt);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!agendamentoId || !enabled) return;
    const interval = setInterval(() => save.current(), AUTOSAVE_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", () => save.current());
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [agendamentoId, enabled]);

  return {
    lastSavedAt,
    saveNow: () => save.current(),
  };
}
