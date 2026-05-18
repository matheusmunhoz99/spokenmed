import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createMeeting, deleteMeeting } from "./tele-whereby.server";
import crypto from "crypto";

function randomToken() {
  return crypto.randomBytes(24).toString("hex"); // 48 chars
}

const SALA_COLS =
  "id, agendamento_id, daily_room_name, daily_room_url, host_room_url, whereby_meeting_id, token_paciente, gravar, status, consentimento_gravacao";

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

    const { data: existing } = await supabaseAdmin
      .from("teleconsulta_salas")
      .select(SALA_COLS)
      .eq("agendamento_id", data.agendamento_id)
      .maybeSingle();
    if (existing) return { sala: existing };

    const inicioMs = new Date(`${ag.data}T${ag.hora_inicio}`).getTime();
    const endsInSeconds = Math.max(3600, Math.floor((inicioMs - Date.now()) / 1000) + 4 * 3600);
    const meeting = await createMeeting({ endsInSeconds });

    const token = randomToken();
    const { data: sala, error } = await supabaseAdmin
      .from("teleconsulta_salas")
      .insert({
        agendamento_id: data.agendamento_id,
        daily_room_name: meeting.roomName,        // legado: armazena room name
        daily_room_url: meeting.roomUrl,          // URL do paciente (guest)
        host_room_url: meeting.hostRoomUrl,       // URL do médico (host)
        whereby_meeting_id: meeting.meetingId,
        token_paciente: token,
        gravar: false, // gravação em nuvem requer plano pago no Whereby
      })
      .select(SALA_COLS)
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("agendamentos")
      .update({ modalidade: "teleconsulta", tele_sala_id: sala.id })
      .eq("id", data.agendamento_id);

    return { sala };
  });

/** Retorna a URL de host do médico para a sala. */
export const gerarTokenMedico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sala_id: string }) => z.object({ sala_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sala, error } = await supabase
      .from("teleconsulta_salas")
      .select("id, host_room_url, daily_room_url")
      .eq("id", data.sala_id)
      .single();
    if (error || !sala) throw new Error("Sala não encontrada ou sem acesso");
    const url = (sala as any).host_room_url || sala.daily_room_url;
    if (!url) throw new Error("Sala sem URL configurada");
    // Mantemos a forma { token, room_url } para compatibilidade com o front;
    // no Whereby a URL já é assinada, então retornamos token vazio.
    return { token: "", room_url: url };
  });

/** Gravação em nuvem não está disponível no plano Free do Whereby. */
export const iniciarGravacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sala_id: string }) => z.object({ sala_id: z.string().uuid() }).parse(d))
  .handler(async () => {
    throw new Error("Gravação em nuvem indisponível no plano atual do provedor de vídeo");
  });

export const pararGravacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sala_id: string }) => z.object({ sala_id: z.string().uuid() }).parse(d))
  .handler(async () => {
    return { ok: true, recording_url: null as string | null };
  });

export const encerrarSala = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sala_id: string }) => z.object({ sala_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sala } = await supabase
      .from("teleconsulta_salas")
      .select("id, whereby_meeting_id")
      .eq("id", data.sala_id)
      .maybeSingle();

    await supabase.from("teleconsulta_salas").update({
      status: "encerrada", encerrada_em: new Date().toISOString(),
    }).eq("id", data.sala_id);

    if ((sala as any)?.whereby_meeting_id) {
      await deleteMeeting((sala as any).whereby_meeting_id);
    }
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

/** Paciente: troca token por URL de convidado (guest) do Whereby. */
export const pacienteEntrar = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { data: rpc, error } = await supabaseAdmin
      .rpc("tele_paciente_entrar", { p_token: data.token });
    if (error) throw new Error(error.message);
    const row = (rpc as any[])?.[0];
    if (!row) throw new Error("Link inválido ou expirado");
    return {
      sala_id: row.sala_id,
      room_url: row.room_url,
      meeting_token: "", // não usado no Whereby
      paciente_nome: row.paciente_nome,
      profissional_nome: row.profissional_nome,
      data: row.data,
      hora_inicio: row.hora_inicio,
      gravar: row.gravar,
      consentimento_gravacao: row.consentimento_gravacao,
      status: row.status,
    };
  });
