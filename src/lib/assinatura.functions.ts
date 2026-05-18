import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac, timingSafeEqual, createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AssinarSchema = z.object({
  protocolo: z.string().min(6).max(60),
  tipo: z.enum(["receita", "atestado", "sadt", "lme", "comprovante"]),
  conteudo_hash: z.string().min(8).max(128),
});

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Gera assinatura HMAC-SHA256 do documento usando o segredo do profissional.
 * Retorna a assinatura e o timestamp; o caller deve gravá-los no documento (via registrarDocumento).
 */
export const assinarDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AssinarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: prof, error } = await supabase
      .from("profiles")
      .select("conselho_tipo, conselho_numero, conselho_uf")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prof?.conselho_tipo || !prof?.conselho_numero) {
      throw new Error("Conselho profissional não cadastrado. Acesse Meu Perfil.");
    }

    // Busca segredo via admin (RLS impede leitura direta)
    const { data: secretRow, error: secErr } = await supabaseAdmin
      .from("profiles")
      .select("assinatura_secret")
      .eq("id", userId)
      .maybeSingle();
    if (secErr) throw new Error(secErr.message);
    const secret = secretRow?.assinatura_secret;
    if (!secret) throw new Error("Segredo de assinatura não configurado.");

    const assinadoEm = new Date().toISOString();
    const payload = JSON.stringify({
      protocolo: data.protocolo,
      tipo: data.tipo,
      conteudo_hash: data.conteudo_hash,
      profissional_id: userId,
      assinado_em: assinadoEm,
    });
    const payloadSha = sha256Hex(payload);
    const assinatura = createHmac("sha256", secret).update(payload).digest("hex");

    return {
      assinatura,
      assinatura_payload_sha: payloadSha,
      assinado_em: assinadoEm,
      conselho: `${prof.conselho_tipo} ${prof.conselho_numero}${prof.conselho_uf ? "/" + prof.conselho_uf : ""}`,
    };
  });

const VerificarSchema = z.object({
  protocolo: z.string().min(6).max(60),
});

/**
 * Re-valida a integridade da assinatura de um documento.
 * Público (sem auth) — apenas confirma se o HMAC bate com os dados gravados.
 */
export const verificarAssinatura = createServerFn({ method: "POST" })
  .inputValidator((input) => VerificarSchema.parse(input))
  .handler(async ({ data }) => {
    const protocolo = data.protocolo.trim().toUpperCase();

    const { data: doc, error } = await supabaseAdmin
      .from("documentos_emitidos")
      .select("protocolo, tipo, assinatura, assinatura_payload_sha, assinado_em, emitido_por, metadata")
      .eq("protocolo", protocolo)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc || !doc.assinatura || !doc.assinado_em || !doc.emitido_por) {
      return { valido: false, motivo: "Documento sem assinatura registrada." };
    }

    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("assinatura_secret")
      .eq("id", doc.emitido_por)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prof?.assinatura_secret) {
      return { valido: false, motivo: "Segredo do emissor indisponível." };
    }

    const conteudo_hash = (doc.metadata as { conteudo_hash?: string } | null)?.conteudo_hash;
    if (!conteudo_hash) {
      return { valido: false, motivo: "Documento sem hash de conteúdo." };
    }

    const payload = JSON.stringify({
      protocolo: doc.protocolo,
      tipo: doc.tipo,
      conteudo_hash,
      profissional_id: doc.emitido_por,
      assinado_em: doc.assinado_em,
    });
    const esperado = createHmac("sha256", prof.assinatura_secret).update(payload).digest("hex");

    let ok = false;
    try {
      ok = timingSafeEqual(Buffer.from(esperado, "hex"), Buffer.from(doc.assinatura, "hex"));
    } catch {
      ok = false;
    }

    return ok
      ? { valido: true, motivo: "Assinatura íntegra. HMAC-SHA256 confere com o segredo do profissional emissor." }
      : { valido: false, motivo: "Assinatura inválida — documento pode ter sido adulterado." };
  });

/**
 * Helper exportado para uso em browser code para calcular o hash do conteúdo do PDF
 * antes de chamar assinarDocumento.
 */
export function hashConteudo(input: string): string {
  return sha256Hex(input);
}
