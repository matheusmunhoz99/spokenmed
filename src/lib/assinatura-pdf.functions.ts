import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac, createHash, randomBytes } from "crypto";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Schema = z.object({
  nome_arquivo: z.string().min(1).max(200),
  hash_original: z.string().length(64),
  tamanho_bytes: z.number().int().nonnegative().optional(),
  motivo: z.string().max(300).optional().nullable(),
  agendamento_id: z.string().uuid().optional().nullable(),
  paciente_id: z.string().uuid().optional().nullable(),
  unidade_id: z.string().uuid().optional().nullable(),
});

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function maskIp(ip: string | null | undefined) {
  if (!ip) return null;
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + ":***";
  return ip.replace(/\.\d+$/, ".***");
}

function gerarProtocoloServer() {
  const ts = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `ASSIN-${ts}-${rand}`;
}

/**
 * Assina digitalmente (HMAC-SHA256 com o segredo do usuário) um PDF já hasheado
 * no navegador. Registra autor, data/hora, IP e navegador — padrão "Assinatura
 * Eletrônica Avançada" (art. 4º, II da Lei 14.063/2020).
 */
export const assinarPdfRegistro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    const { data: prof } = await supabase
      .from("profiles")
      .select("nome, cargo, conselho_tipo, conselho_numero, conselho_uf, cbo")
      .eq("id", userId)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let secret: string | null = null;
    const { data: secretRow } = await supabaseAdmin
      .from("profiles")
      .select("assinatura_secret")
      .eq("id", userId)
      .maybeSingle();
    secret = secretRow?.assinatura_secret ?? null;
    if (!secret) {
      secret = randomBytes(32).toString("hex");
      await supabaseAdmin.from("profiles").update({ assinatura_secret: secret }).eq("id", userId);
    }

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? null;

    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const userAgent = (getRequestHeader("user-agent") ?? "").slice(0, 300) || null;

    const protocolo = gerarProtocoloServer();
    const assinadoEm = new Date().toISOString();
    const conselho =
      prof?.conselho_tipo && prof?.conselho_numero
        ? `${prof.conselho_tipo} ${prof.conselho_numero}${prof.conselho_uf ? "/" + prof.conselho_uf : ""}`
        : null;

    const payload = JSON.stringify({
      protocolo,
      hash_original: data.hash_original,
      nome_arquivo: data.nome_arquivo,
      signatario: userId,
      assinado_em: assinadoEm,
    });
    const assinatura = createHmac("sha256", secret).update(payload).digest("hex");

    const { error } = await supabaseAdmin.from("assinaturas_pdf").insert({
      protocolo,
      nome_arquivo: data.nome_arquivo,
      hash_original: data.hash_original,
      tamanho_bytes: data.tamanho_bytes ?? null,
      motivo: data.motivo ?? null,
      agendamento_id: data.agendamento_id ?? null,
      paciente_id: data.paciente_id ?? null,
      unidade_id: data.unidade_id ?? null,
      assinante_user_id: userId,
      assinante_nome: prof?.nome ?? email ?? "Usuário",
      assinante_email: email,
      assinante_conselho: conselho,
      assinante_cbo: prof?.cbo ?? null,
      ip,
      user_agent: userAgent,
      assinatura,
      assinatura_payload_sha: sha256Hex(payload),
      assinado_em: assinadoEm,
    });
    if (error) throw new Error(error.message);

    return {
      protocolo,
      assinatura,
      assinado_em: assinadoEm,
      assinante_nome: prof?.nome ?? email ?? "Usuário",
      assinante_email: email,
      assinante_cargo: prof?.cargo ?? null,
      assinante_conselho: conselho,
      ip_mask: maskIp(ip),
    };
  });

const FinalizarSchema = z.object({
  protocolo: z.string().min(6).max(60),
  storage_path: z.string().min(3).max(400),
  storage_path_original: z.string().min(3).max(400).optional().nullable(),
  hash_assinado: z.string().length(64),
});

/** Registra o caminho do arquivo assinado no storage e o hash final. */
export const finalizarAssinaturaPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FinalizarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("assinaturas_pdf")
      .update({
        storage_path: data.storage_path,
        storage_path_original: data.storage_path_original ?? null,
        hash_assinado: data.hash_assinado,
      })
      .eq("protocolo", data.protocolo)
      .eq("assinante_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
