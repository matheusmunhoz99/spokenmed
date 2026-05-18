// Domínio canônico de verificação pública do SpokenMED.
// NÃO usar lovable.app aqui — sempre o domínio próprio.
export const VERIFY_BASE = "https://spokenmed.oppcloud.com.br";
export const VERIFY_HOST = "spokenmed.oppcloud.com.br";
export const VERIFY_DISPLAY = "spokenmed.oppcloud.com.br/verificar";

export function buildVerifyUrl(protocolo: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ p: protocolo, ...(extra ?? {}) });
  return `${VERIFY_BASE}/verificar?${params.toString()}`;
}
