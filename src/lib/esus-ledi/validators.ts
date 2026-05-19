// Validadores LEDI — lançam Error com mensagem clara.

export function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D+/g, "");
}

export function validateCnes(s: string): string {
  const d = digitsOnly(s);
  if (d.length !== 7) throw new Error(`CNES inválido (esperado 7 dígitos): "${s}"`);
  return d;
}

export function validateIne(s: string): string {
  const d = digitsOnly(s);
  if (d.length !== 10) throw new Error(`INE inválido (esperado 10 dígitos): "${s}"`);
  return d;
}

export function validateIbge(s: string): string {
  const d = digitsOnly(s);
  if (d.length !== 7) throw new Error(`Código IBGE inválido (esperado 7 dígitos): "${s}"`);
  return d;
}

export function validateCpf(s: string): string {
  const d = digitsOnly(s);
  if (d.length !== 11) throw new Error(`CPF inválido (esperado 11 dígitos): "${s}"`);
  if (/^(\d)\1{10}$/.test(d)) throw new Error(`CPF inválido (sequência repetida): "${s}"`);
  // DV
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (factor - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  if (calc(d.slice(0, 9), 10) !== Number(d[9])) throw new Error(`CPF com DV inválido: "${s}"`);
  if (calc(d.slice(0, 10), 11) !== Number(d[10])) throw new Error(`CPF com DV inválido: "${s}"`);
  return d;
}

export function validateCns(s: string): string {
  const d = digitsOnly(s);
  if (d.length !== 15) throw new Error(`CNS inválido (esperado 15 dígitos): "${s}"`);
  // Mod 11 oficial (1, 2 ou 7) / mod 11 (3, 8, 9).
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += Number(d[i]) * (15 - i);
  if (sum % 11 !== 0) throw new Error(`CNS com soma de verificação inválida: "${s}"`);
  return d;
}

export function validateUuidLedi(s: string): string {
  if (!s || s.length < 36 || s.length > 44) {
    throw new Error(`UUID LEDI inválido (esperado 36..44 chars): "${s}"`);
  }
  return s;
}

export function validateCpfOuCnpj(s: string): string {
  const d = digitsOnly(s);
  if (d.length !== 11 && d.length !== 14) {
    throw new Error(`CPF/CNPJ do remetente inválido (esperado 11 ou 14 dígitos): "${s}"`);
  }
  return d;
}
