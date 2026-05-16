/**
 * Haptic feedback discreto para PWA mobile.
 * - Android Chrome: usa navigator.vibrate.
 * - iOS Safari/PWA: ignora silenciosamente (API não suportada).
 * - Desktop: ignora.
 */
type HapticKind = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";

const PATTERNS: Record<HapticKind, number | number[]> = {
  selection: 8,
  light: 12,
  medium: 22,
  heavy: 35,
  success: [12, 40, 12],
  warning: [20, 60, 20],
  error: [40, 60, 40, 60, 40],
};

export function haptic(kind: HapticKind = "light") {
  if (typeof window === "undefined") return;
  const nav = window.navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(PATTERNS[kind]);
  } catch {
    /* noop */
  }
}

export function useHaptics() {
  return haptic;
}
