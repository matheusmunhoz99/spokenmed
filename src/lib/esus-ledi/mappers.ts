// Mappers: convertem rows do Supabase em models LEDI.
import { DesfechoVisita, Sexo, Turno, VisitaDomiciliar } from "./models";
import { digitsOnly } from "./validators";
import { makeLediUuid } from "./uuid";

const TURNO_MAP: Record<string, Turno> = {
  manha: 1, "manhã": 1, m: 1,
  tarde: 2, t: 2,
  noite: 3, n: 3,
};

const SEXO_MAP: Record<string, Sexo> = {
  F: 0, FEMININO: 0,
  M: 1, MASCULINO: 1,
};

const DESFECHO_MAP: Record<string, DesfechoVisita> = {
  realizada: 1, visita_realizada: 1, "1": 1,
  recusada: 2, visita_recusada: 2, "2": 2,
  ausente: 3, "3": 3,
};

export interface VisitaRowDb {
  id: string;
  uuid_ficha: string;
  turno?: string | null;
  microarea?: string | null;
  fora_area?: boolean | null;
  desfecho?: string | null;
  motivos?: unknown;
  paciente?: {
    cpf?: string | null;
    cns?: string | null;
    data_nascimento?: string | null;
    sexo?: string | null;
  } | null;
  tipo_imovel?: number | null;
}

function epochMsFromDate(d: string | null | undefined): number | undefined {
  if (!d) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const t = Date.parse(`${d}T00:00:00Z`);
    return Number.isFinite(t) ? t : undefined;
  }
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : undefined;
}

export function visitaFromDb(row: VisitaRowDb, cnes: string): VisitaDomiciliar {
  const p = row.paciente ?? {};
  const cpf = digitsOnly(p.cpf ?? "");
  const cns = digitsOnly(p.cns ?? "");
  const motivosRaw = Array.isArray(row.motivos) ? (row.motivos as unknown[]) : [];
  const motivos = motivosRaw
    .map((m) => (typeof m === "number" ? m : Number(m)))
    .filter((n) => Number.isFinite(n));
  // uuid_ficha vem como uuid v4 sem prefixo CNES — prefixa para virar UUID LEDI 44 chars.
  const uuidFicha = row.uuid_ficha
    ? `${cnes}-${row.uuid_ficha}`
    : makeLediUuid(cnes);

  return {
    uuidFicha,
    turno: TURNO_MAP[String(row.turno ?? "").toLowerCase()],
    cpfCidadao: cpf || undefined,
    cnsCidadao: !cpf && cns ? cns : undefined,
    dtNascimento: epochMsFromDate(p.data_nascimento ?? null),
    sexo: SEXO_MAP[String(p.sexo ?? "").toUpperCase()],
    statusVisitaCompartilhadaOutroProfissional: false,
    motivosVisita: motivos,
    desfecho: DESFECHO_MAP[String(row.desfecho ?? "").toLowerCase()],
    microArea: row.microarea ?? undefined,
    stForaArea: !!row.fora_area,
    tipoDeImovel: row.tipo_imovel ?? undefined,
  };
}
