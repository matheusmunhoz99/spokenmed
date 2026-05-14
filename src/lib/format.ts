export const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

export const formatCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
};

export const formatCNS = (v: string) => {
  const d = onlyDigits(v).slice(0, 15);
  return d.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
};

export const formatPhone = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
};

export const formatCEP = (v: string) => {
  const d = onlyDigits(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
};

export const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
};

export const formatTime = (t?: string | null) => (t ?? "").slice(0, 5);
