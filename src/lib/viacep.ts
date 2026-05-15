import { onlyDigits } from "./format";

export type ViaCepResult = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento?: string;
};

export async function fetchCep(cep: string): Promise<ViaCepResult | null> {
  const d = onlyDigits(cep);
  if (d.length !== 8) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    if (j?.erro) return null;
    return {
      logradouro: j.logradouro ?? "",
      bairro: j.bairro ?? "",
      cidade: j.localidade ?? "",
      uf: j.uf ?? "",
      complemento: j.complemento ?? "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
