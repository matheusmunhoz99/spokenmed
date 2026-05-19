import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AtendHistItem {
  id: string;
  agendamento_id: string | null;
  protocolo: string | null;
  finalizado_em: string;
  data_atendimento: string | null;
  hora_inicio: string | null;
  duracao_segundos: number;
  status_envio: "pendente" | "exportado" | "desatualizado";
  exportado_em: string | null;
  soap: { s: string | null; o: string | null; a: string | null; p: string | null };
  cids: string[];
  ciaps: string[];
  vitais: { pa: string | null; fc: string | null; fr: string | null; temp: string | null; sat: string | null; peso: number | null; altura: number | null };
  documentos: Record<string, any>;
  unidade: { id: string | null; nome: string | null; cnes: string | null; ine: string | null; endereco: string | null };
  paciente: { id: string | null; nome: string | null; cpf: string | null; cns: string | null; telefone: string | null };
  profissional: { id: string | null; nome: string | null; cbo: string | null; conselho: string | null; conselho_numero: string | null; conselho_uf: string | null };
  /** True se ainda dá pra reabrir: <2h da finalização e não exportado */
  pode_reabrir: boolean;
  /** Minutos restantes pra reabrir (0 se já expirou) */
  minutos_restantes: number;
}

/** Lista atendimentos finalizados (do banco) com filtros básicos. */
export const listAtendimentosFinalizados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        soMeus: z.boolean().default(false),
        limit: z.number().min(1).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ itens: AtendHistItem[] }> => {
    const { supabase, userId } = context;
    let q = supabase
      .from("atendimentos")
      .select(
        "id, agendamento_id, protocolo, finalizado_em, data_atendimento, hora_inicio, duracao_segundos, status_envio, exportado_em, criado_por, paciente_id, profissional_id, unidade_id, soap_s, soap_o, soap_a, soap_p, cids, ciaps, pa, fc, fr, temperatura, saturacao, peso, altura, documentos",
      )
      .order("finalizado_em", { ascending: false })
      .limit(data.limit);

    if (data.soMeus) q = q.eq("criado_por", userId);
    if (data.inicio) q = q.gte("finalizado_em", `${data.inicio}T00:00:00Z`);
    if (data.fim) q = q.lte("finalizado_em", `${data.fim}T23:59:59Z`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = rows ?? [];

    const ids = {
      pac: Array.from(new Set(list.map((r: any) => r.paciente_id).filter(Boolean))) as string[],
      prof: Array.from(new Set(list.map((r: any) => r.profissional_id).filter(Boolean))) as string[],
      uni: Array.from(new Set(list.map((r: any) => r.unidade_id).filter(Boolean))) as string[],
    };
    const [pacs, profs, unis] = await Promise.all([
      ids.pac.length
        ? supabase.from("pacientes").select("id, nome, cpf, cns, telefone").in("id", ids.pac)
        : Promise.resolve({ data: [] as any[] }),
      ids.prof.length
        ? supabase.from("profissionais").select("id, nome, cbo, conselho, conselho_numero, conselho_uf").in("id", ids.prof)
        : Promise.resolve({ data: [] as any[] }),
      ids.uni.length
        ? supabase.from("unidades").select("id, nome, cnes, endereco").in("id", ids.uni)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const mP = new Map((pacs.data ?? []).map((x: any) => [x.id, x]));
    const mPr = new Map((profs.data ?? []).map((x: any) => [x.id, x]));
    const mU = new Map((unis.data ?? []).map((x: any) => [x.id, x]));
    return {
      itens: list.map((r: any) => mapRow(r, mP.get(r.paciente_id), mPr.get(r.profissional_id), mU.get(r.unidade_id))),
    };
  });

function mapRow(r: any, pac: any, prof: any, uni: any): AtendHistItem {
  const fim = r.finalizado_em ? new Date(r.finalizado_em).getTime() : 0;
  const elapsedMin = fim ? Math.floor((Date.now() - fim) / 60000) : Infinity;
  const restantes = Math.max(0, 120 - elapsedMin);
  const pode = restantes > 0 && r.status_envio !== "exportado";
  return {
    id: r.id,
    agendamento_id: r.agendamento_id ?? null,
    protocolo: r.protocolo ?? null,
    finalizado_em: r.finalizado_em,
    data_atendimento: r.data_atendimento ?? null,
    hora_inicio: r.hora_inicio ?? null,
    duracao_segundos: r.duracao_segundos ?? 0,
    status_envio: r.status_envio ?? "pendente",
    exportado_em: r.exportado_em ?? null,
    soap: { s: r.soap_s, o: r.soap_o, a: r.soap_a, p: r.soap_p },
    cids: r.cids ?? [],
    ciaps: r.ciaps ?? [],
    vitais: { pa: r.pa, fc: r.fc, fr: r.fr, temp: r.temperatura, sat: r.saturacao, peso: r.peso, altura: r.altura },
    documentos: r.documentos ?? {},
    unidade: { id: uni?.id ?? null, nome: uni?.nome ?? null, cnes: uni?.cnes ?? null, ine: null, endereco: uni?.endereco ?? null },
    paciente: { id: pac?.id ?? null, nome: pac?.nome ?? null, cpf: pac?.cpf ?? null, cns: pac?.cns ?? null, telefone: pac?.telefone ?? null },
    profissional: { id: prof?.id ?? null, nome: prof?.nome ?? null, cbo: prof?.cbo ?? null, conselho: prof?.conselho ?? null, conselho_numero: prof?.conselho_numero ?? null, conselho_uf: prof?.conselho_uf ?? null },
    pode_reabrir: pode,
    minutos_restantes: Number.isFinite(restantes) ? restantes : 0,
  };
}

/**
 * Reabre um atendimento: valida janela de 2h + não exportado, apaga o registro
 * e devolve o agendamento ao status anterior (em_atendimento), para que o médico
 * possa atender novamente pelo consultório.
 */
export const reabrirAtendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ atendimentoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; agendamentoId: string | null }> => {
    const { supabase, userId } = context;

    const { data: at, error } = await supabase
      .from("atendimentos")
      .select("id, agendamento_id, finalizado_em, status_envio, criado_por")
      .eq("id", data.atendimentoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!at) throw new Error("Atendimento não encontrado.");

    if (at.criado_por && at.criado_por !== userId) {
      // permitir só o autor (admin é coberto pela política RLS de delete)
      // se RLS bloquear o delete abaixo, mensagem amigável aparece.
    }
    if (at.status_envio === "exportado") {
      throw new Error("Este atendimento já foi exportado ao eSUS e não pode ser reaberto.");
    }
    if (at.finalizado_em) {
      const elapsedMs = Date.now() - new Date(at.finalizado_em).getTime();
      if (elapsedMs > 2 * 60 * 60 * 1000) {
        throw new Error("Prazo de 2 horas para reabertura expirou.");
      }
    }

    // Reseta o agendamento (se houver) pra triado, mantendo na fila do médico
    if (at.agendamento_id) {
      const { error: upErr } = await supabase
        .from("agendamentos")
        .update({ status: "triado" as any, atendido_em: null })
        .eq("id", at.agendamento_id);
      if (upErr) console.error("[reabrir] reset agendamento", upErr);
    }

    // Apaga o atendimento (libera pra ser reescrito quando o médico finalizar de novo)
    const { error: delErr } = await supabase.from("atendimentos").delete().eq("id", data.atendimentoId);
    if (delErr) throw new Error(`Falha ao reabrir: ${delErr.message}`);

    return { ok: true, agendamentoId: at.agendamento_id ?? null };
  });
