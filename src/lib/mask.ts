import { formatCPF, formatCNS, formatPhone, onlyDigits } from "./format";

export function maskCPF(v?: string | null) {
  if (!v) return "—";
  const d = onlyDigits(v);
  if (d.length < 11) return formatCPF(d);
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export function maskCNS(v?: string | null) {
  if (!v) return "—";
  const d = onlyDigits(v);
  if (d.length < 15) return formatCNS(d);
  return `*** *** *** ${d.slice(12)}`;
}

export function maskPhone(v?: string | null) {
  if (!v) return "—";
  const d = onlyDigits(v);
  if (d.length < 10) return formatPhone(d);
  const last = d.slice(-4);
  const ddd = d.slice(0, 2);
  return `(${ddd}) *****-${last}`;
}

export function maskEmail(v?: string | null) {
  if (!v) return "—";
  const [user, domain] = v.split("@");
  if (!domain) return v;
  const u = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "***";
  return `${u}@${domain}`;
}
