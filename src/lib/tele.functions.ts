import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as Daily from "./tele-daily.server";
import crypto from "crypto";

function randomToken() {
  return crypto.randomBytes(24).toString("hex"); // 48 chars
}
function safeRoomName(agendamentoId: string) {
  return `tele-${agendamentoId.replace(/-/g, "").slice(0, 20)}-${crypto.randomBytes(3).toString("hex")}`;
}

/** Cria sala (idempotente: retorna existente) e marca agendamento como teleconsulta. */
export const criarSalaTele = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agendamento_id: string; gravar?: boolean }) =>
    z.object({ agendamento_id: z.string().uuid(), gravar: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ag, error: agErr } = await supabase
      .from("agendamentos")
      .select("id, data, hora_inicio, tele_sala_id, paciente_id, pacientes(nome)")
      .eq("id", data.agendamento_id)
      .single();
    if (agErr || !ag) throw new Error("Agendamento não encontrado");

    // existente?
    const { data: existing } = await supabaseAdmin
      .from("teleconsulta_salas")
      .select("*")
      .eq("agendamento_id", data.agendamento_id)
      .maybeSingle();
    if (existing) return { sala: existing };

    const roomName = safeRoomName(data.agendamento_id);
    // sala válida até 4h após o horário marcado
    const inicioMs = new Date(`${ag.data}T${ag.hora_inicio}`).getTime();
    const expSeconds = Math.max(3600, Math.floor((inicioMs - Date.now()) / 1000) + 4 * 3600);
    const room = await Daily.createRoom({ name: roomName, expSeconds, enableRecording: true });

    const token = randomToken();
    const { data: sala, error } = await supabaseAdmin
      .from("teleconsulta_salas")
      .insert({
        agendamento_id: data.agendamento_id,
        daily_room_name: room.name,
        daily_room_url: room.url,
        token_paciente: token,
        gravar: !!data.gravar,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("agendamentos")
      .update({ modalidade: "teleconsulta", tele_sala_id: sala.id })
      .eq("id", data.agendamento_id);

    return { sala };
  });

/** Gera meeting token de owner para o médico entrar. */
export const gerarTokenMedico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sala_id: string }) => z.object({ sala_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Garante que é o médico do agendamento (RLS já restringe, mas validamos para clareza)
    const { data: sala, error } = await supabase
      .from("teleconsulta_salas")
      .select("id, daily_room_name, daily_room_url, agendamento_id")
      .eq("id", data.sala_id)
      .single();
    if (error || !sala) throw new Error("Sala não encontrada ou sem acesso");

    const { data: prof } = await supabaseAdmin
      .from("profiles").select("nome").eq("id", userId).maybeSingle();

    const tok = await Daily.createMeetingToken({
      roomName: sala.daily_room_name,
      userName: prof?.nome || "Médico(a)",
      isOwner: true,
      expSeconds: 4 * 3600,
    });
    return { token: tok.token, room_url: sala.daily_room_url };
  });

/** Inicia gravação (exige consentimento). */
export const iniciarGravacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sala_id: string }) => z.object({ sala_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sala, error } = await supabase
      .from("teleconsulta_salas")
      .select("*")
      .eq("id", data.sala_id)
      .single();
    if (error || !sala) throw new Error("Sala não encontrada");
    if (!sala.consentimento_gravacao) throw new Error("Paciente ainda não aceitou a gravação");
    const r = await Daily.startRecording(sala.daily_room_name);
    await supabaseAdmin.from("teleconsulta_salas")
      .update({ gravar: true, recording_id: r?.recordingId || r?.id || null })
      .eq("id", sala.id);
    return { ok: true };
  });

/** Para gravação e busca o link de acesso. */
export const pararGravacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sala_id: string }) => z.object({ sala_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sala, error } = await supabase
      .from("teleconsulta_salas")
      .select("*")
      .eq("id", data.sala_id)
      .single();
    if (error || !sala) throw new Error("Sala não encontrada");
    try { await Daily.stopRecording(sala.daily_room_name); } catch (_) { /* ignore */ }

    let url: string | null = null;
    let exp: string | null = null;
    try {
      const list = await Daily.listRecordings(sala.daily_room_name);
      const recId = list?.data?.[0]?.id;
      if (recId) {
        const link = await Daily.getRecordingAccessLink(recId);
        url = link?.download_link || link?.url || null;
        // a maioria expira em ~1h; refrescamos sob demanda no front
        exp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      }
    } catch (_) { /* ignore */ }

    await supabaseAdmin.from("teleconsulta_salas").update({
      recording_url: url,
      recording_expira_em: exp,
      status: "encerrada",
      encerrada_em: new Date().toISOString(),
    }).eq("id", sala.id);
    return { ok: true, recording_url: url };
  });

export const encerrarSala = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sala_id: string }) => z.object({ sala_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("teleconsulta_salas").update({
      status: "encerrada", encerrada_em: new Date().toISOString(),
    }).eq("id", data.sala_id);
    return { ok: true };
  });

/** Salva resumo/notas do médico para o paciente. */
export const salvarResumo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agendamento_id: string; resumo_paciente?: string; notas_internas?: string; publicar: boolean }) =>
    z.object({
      agendamento_id: z.string().uuid(),
      resumo_paciente: z.string().max(8000).optional(),
      notas_internas: z.string().max(8000).optional(),
      publicar: z.boolean(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      agendamento_id: data.agendamento_id,
      resumo_paciente: data.resumo_paciente ?? null,
      notas_internas: data.notas_internas ?? null,
      publicado: data.publicar,
      publicado_em: data.publicar ? new Date().toISOString() : null,
      created_by: userId,
    };
    const { error } = await supabase
      .from("teleconsulta_resumos")
      .upsert(payload, { onConflict: "agendamento_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Paciente: troca token por meeting token + room url. */
export const pacienteEntrar = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { data: rpc, error } = await supabaseAdmin
      .rpc("tele_paciente_entrar", { p_token: data.token });
    if (error) throw new Error(error.message);
    const row = (rpc as any[])?.[0];
    if (!row) throw new Error("Link inválido ou expirado");
    const tok = await Daily.createMeetingToken({
      roomName: row.room_name,
      userName: row.paciente_nome || "Paciente",
      isOwner: false,
      expSeconds: 2 * 3600,
    });
    return {
      sala_id: row.sala_id,
      room_url: row.room_url,
      meeting_token: tok.token,
      paciente_nome: row.paciente_nome,
      profissional_nome: row.profissional_nome,
      data: row.data,
      hora_inicio: row.hora_inicio,
      gravar: row.gravar,
      consentimento_gravacao: row.consentimento_gravacao,
      status: row.status,
    };
  });
