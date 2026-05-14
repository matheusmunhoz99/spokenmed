import { supabase } from "@/integrations/supabase/client";

const ua = () => (typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined);

export async function logView(tabela: string, registro_id: string, modulo: string) {
  try {
    await supabase.rpc("log_view", {
      p_tabela: tabela,
      p_registro_id: registro_id,
      p_modulo: modulo,
      p_ip: undefined,
      p_ua: ua(),
    });
  } catch {
    /* silencioso — auditoria não pode quebrar UX */
  }
}

export async function logAuth(acao: "LOGIN" | "LOGOUT") {
  try {
    await supabase.rpc("log_auth", { p_acao: acao, p_ip: undefined, p_ua: ua() });
  } catch {
    /* noop */
  }
}

export async function logExport(tabela: string, modulo: string, filtros: unknown) {
  try {
    await supabase.rpc("log_export", {
      p_tabela: tabela,
      p_modulo: modulo,
      p_filtros: filtros as never,
      p_ip: undefined,
      p_ua: ua(),
    });
  } catch {
    /* noop */
  }
}

const VIEW_CACHE = new Set<string>();
export function logViewOnce(tabela: string, registro_id: string, modulo: string) {
  const key = `${tabela}:${registro_id}`;
  if (VIEW_CACHE.has(key)) return;
  VIEW_CACHE.add(key);
  void logView(tabela, registro_id, modulo);
}
