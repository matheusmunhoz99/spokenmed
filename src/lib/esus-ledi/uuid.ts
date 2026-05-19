// UUID LEDI: <cnes>-<uuidv4> (44 chars).
import { validateCnes } from "./validators";

function uuidv4(): string {
  // crypto.randomUUID() existe no Worker e no Node 19+.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback: gera v4 manualmente.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function makeLediUuid(cnes: string): string {
  return `${validateCnes(cnes)}-${uuidv4()}`;
}
