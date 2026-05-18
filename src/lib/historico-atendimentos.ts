// Histórico local (simulado) de atendimentos finalizados no consultório.
// Como a simulação não persiste no banco, usamos localStorage para permitir
// que o médico consulte o histórico e reimprima documentos gerados.

import type { ReceitaTipo } from "@/lib/pdf-receita";

const KEY = "spokenmed:historico-atendimentos:v1";

export interface HistMed { nome: string; apresentacao?: string; posologia: string; qtd: string; duracao: string; }
export interface HistAlergia { substancia: string; reacao: string; gravidade: "leve" | "moderada" | "grave"; }

export interface HistAtendimento {
  id: string;                      // uuid local
  agendamento_id: string;
  protocolo: string;
  finalizado_em: string;           // ISO
  duracao_segundos: number;

  medico_email: string;
  medico_nome: string;

  paciente: { nome: string; cpf?: string; cns?: string; telefone?: string };
  profissional: { nome: string; crm: string; uf: string; cbo: string };
  unidade: { nome: string; cnes: string; ine: string; endereco: string };

  soap: { s: string; o: string; a: string; p: string };
  cids: string[];
  vitais: { pa: string; fc: string; fr?: string; temp: string; sat: string; peso: string; altura?: string };
  alergias: HistAlergia[];

  documentos: {
    receita?: { tipo: ReceitaTipo; meds: HistMed[]; orientacoes: string };
    sadt?: { exames: string[]; carater: "eletivo"|"prioritario"|"urgente"; indicacao: string };
    lme?: { med: string; apres: string; cid: string; pos: string; qtd: string; tempo: string; anamnese: string; exames: string };
    atestado?: { dias: number; cid: string; mencionarCid: boolean; repouso: boolean };
  };
}

function read(): HistAtendimento[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function write(items: HistAtendimento[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* quota */ }
}

export function listHistorico(): HistAtendimento[] {
  return read().sort((a, b) => b.finalizado_em.localeCompare(a.finalizado_em));
}

export function saveHistorico(item: HistAtendimento) {
  const all = read();
  all.push(item);
  write(all);
}

export function removeHistorico(id: string) {
  write(read().filter((x) => x.id !== id));
}

export function clearHistorico() {
  write([]);
}
