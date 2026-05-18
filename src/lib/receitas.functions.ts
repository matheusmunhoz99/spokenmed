import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac, createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MedSchema = z.object({
  nome: z.string().min(1).max(200),
  apresentacao: z.string().max(200).optional(),
  posologia: z.string().min(1).max(500),
  qtd: z.string().max(80).optional(),
  qtd_extenso: z.string().max(200).optional(),
  duracao: z.string().max(80).optional(),
});

const EmitirSchema = z.object({
  serie: z.enum(["A", "B"]),
  uf: z.string().length(2),
  paciente_id: z.string().uuid().optional().nullable(),
  paciente_nome: z.string().min(1).max(200),
  paciente_cpf: z.string().max(20).optional().nullable(),
  unidade_id: z.string().uuid().optional().nullable(),
  unidade_nome: z.string().max(200).optional().nullable(),
  unidade_cnes: z.string().max(20).optional().nullable(),
  agendamento_id: z.string().uuid().optional().nullable(),
  medicamentos: z.array(MedSchema).min(1).max(20),
  orientacoes: z.string().max(2000).optional().nullable(),
  validade_dias: z.number().int().min(1).max(60).optional(),
});

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function maskCpf(cpf?: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export const emitirReceita = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EmitirSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // 1) Profissional + segredo
    const { data: prof, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("nome, conselho_tipo, conselho_numero, conselho_uf, cbo, assinatura_secret")
      .eq("id", userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prof?.conselho_tipo || !prof?.conselho_numero) {
      throw new Error("Conselho profissional não cadastrado. Acesse Meu Perfil.");
    }
    if (!prof.assinatura_secret) {
      throw new Error("Segredo de assinatura não configurado.");
    }

    const uf = data.uf.toUpperCase();

    // 2) Número sequencial via RPC SECURITY DEFINER
    const { data: numRows, error: numErr } = await supabase.rpc("gerar_numero_receita", {
      p_uf: uf,
      p_serie: data.serie,
    });
    if (numErr) throw new Error(`Falha ao gerar número: ${numErr.message}`);
    const row = Array.isArray(numRows) ? numRows[0] : numRows;
    if (!row?.numero) throw new Error("Número de receita não retornado.");
    const numero: string = row.numero;
    const sequencia: number = Number(row.sequencia);

    // 3) Hash canônico do conteúdo
    const emitidoEm = new Date().toISOString();
    const validadeDias = data.validade_dias ?? 30;
    const canon = JSON.stringify({
      numero,
      serie: data.serie,
      uf,
      paciente: data.paciente_nome,
      profissional: { nome: prof.nome, crm: prof.conselho_numero, uf: prof.conselho_uf },
      medicamentos: data.medicamentos.map((m) => ({
        nome: m.nome, apresentacao: m.apresentacao ?? "", posologia: m.posologia,
        qtd: m.qtd ?? "", duracao: m.duracao ?? "",
      })),
      emitido_em: emitidoEm,
    });
    const hashConteudo = sha256Hex(canon);

    // 4) Assinatura HMAC-SHA256
    const payload = JSON.stringify({
      numero, tipo: "receita_notificacao",
      hash_conteudo: hashConteudo, profissional_id: userId, emitido_em: emitidoEm,
    });
    const assinaturaPayloadSha = sha256Hex(payload);
    const assinatura = createHmac("sha256", prof.assinatura_secret).update(payload).digest("hex");

    // 5) Insert (RLS exige emitido_por = auth.uid())
    const { data: inserted, error: insErr } = await supabase
      .from("receitas")
      .insert({
        numero,
        serie: data.serie,
        uf,
        sequencia,
        profissional_id: null,
        paciente_id: data.paciente_id ?? null,
        agendamento_id: data.agendamento_id ?? null,
        unidade_id: data.unidade_id ?? null,
        profissional_nome: prof.nome,
        profissional_crm: prof.conselho_numero,
        profissional_uf: prof.conselho_uf,
        profissional_cbo: prof.cbo,
        profissional_conselho_tipo: prof.conselho_tipo,
        paciente_nome: data.paciente_nome,
        paciente_cpf_mask: maskCpf(data.paciente_cpf ?? null),
        unidade_nome: data.unidade_nome ?? null,
        unidade_cnes: data.unidade_cnes ?? null,
        medicamentos: data.medicamentos as never,
        orientacoes: data.orientacoes ?? null,
        validade_dias: validadeDias,
        hash_conteudo: hashConteudo,
        assinatura,
        assinatura_payload_sha: assinaturaPayloadSha,
        assinado_em: emitidoEm,
        emitido_por: userId,
        emitido_em: emitidoEm,
      })
      .select("id, numero, emitido_em, validade_dias")
      .single();
    if (insErr) throw new Error(`Falha ao gravar receita: ${insErr.message}`);

    // 6) Log de auditoria (não bloqueia)
    await supabase.from("receita_logs").insert({
      receita_id: inserted.id,
      evento: "emitida",
      user_id: userId,
      metadata: { serie: data.serie, uf, qtd_medicamentos: data.medicamentos.length } as never,
    });

    return {
      id: inserted.id,
      numero,
      sequencia,
      serie: data.serie,
      uf,
      hash_conteudo: hashConteudo,
      assinatura,
      assinatura_curta: `${assinatura.slice(0, 8)}…${assinatura.slice(-4)}`,
      emitido_em: emitidoEm,
      validade_dias: validadeDias,
      conselho: `${prof.conselho_tipo} ${prof.conselho_numero}${prof.conselho_uf ? "/" + prof.conselho_uf : ""}`,
    };
  });

const CancelarSchema = z.object({
  numero: z.string().min(6).max(40),
  motivo: z.string().min(3).max(500),
});

export const cancelarReceita = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CancelarSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const numero = data.numero.trim().toUpperCase();

    const { data: rec, error: selErr } = await supabase
      .from("receitas")
      .select("id, status, emitido_por")
      .eq("numero", numero)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!rec) throw new Error("Receita não encontrada.");
    if (rec.status !== "valida") throw new Error(`Receita já está ${rec.status}.`);

    const { error: upErr } = await supabase
      .from("receitas")
      .update({ status: "cancelada", cancelado_em: new Date().toISOString(), cancelado_motivo: data.motivo })
      .eq("id", rec.id);
    if (upErr) throw new Error(upErr.message);

    await supabase.from("receita_logs").insert({
      receita_id: rec.id, evento: "cancelada", user_id: userId,
      metadata: { motivo: data.motivo } as never,
    });

    return { ok: true };
  });
