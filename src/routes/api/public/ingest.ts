import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Access-Control-Max-Age": "86400",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const bodySchema = z.object({
  origem: z.string().trim().min(1).max(60).default("firebird"),
  tabela: z.string().trim().min(1).max(120),
  chave_primaria: z.union([z.string().max(120), z.array(z.string().max(120))]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  registros: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
});

function chaveDe(
  registro: Record<string, unknown>,
  pk: string | string[] | undefined,
): string | null {
  if (!pk) return null;
  const cols = Array.isArray(pk) ? pk : [pk];
  const parts: string[] = [];
  for (const c of cols) {
    const v = registro[c] ?? registro[c.toUpperCase()] ?? registro[c.toLowerCase()];
    if (v === undefined || v === null || v === "") return null;
    parts.push(String(v));
  }
  return parts.join("|");
}

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const expected = process.env.INGEST_API_KEY;
        if (!expected) {
          return jsonRes({ ok: false, error: "api_key_nao_configurada" }, 500);
        }
        const provided = request.headers.get("x-api-key") ?? "";
        if (provided.length !== expected.length || provided !== expected) {
          return jsonRes({ ok: false, error: "unauthorized" }, 401);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonRes({ ok: false, error: "json_invalido" }, 400);
        }

        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return jsonRes(
            { ok: false, error: "payload_invalido", detalhes: parsed.error.issues.slice(0, 10) },
            400,
          );
        }
        const { origem, tabela, chave_primaria, metadata, registros } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: lote, error: loteErr } = await supabaseAdmin
          .from("integracao_lotes")
          .insert({
            origem,
            tabela,
            total_registros: registros.length,
            metadata: (metadata ?? {}) as never,
            status: "processando",
          })
          .select("id")
          .single();

        if (loteErr || !lote) {
          return jsonRes(
            { ok: false, error: "falha_ao_criar_lote", detalhe: loteErr?.message },
            500,
          );
        }

        const linhas = registros.map((registro) => ({
          lote_id: lote.id,
          origem,
          tabela,
          chave_origem: chaveDe(registro, chave_primaria),
          payload: registro as never,
        }));

        const comChave = linhas.filter((l) => l.chave_origem !== null);
        const semChave = linhas.filter((l) => l.chave_origem === null);
        let inseridos = 0;
        let erro: string | null = null;

        if (comChave.length) {
          const { error, count } = await supabaseAdmin
            .from("integracao_registros")
            .upsert(comChave, { onConflict: "origem,tabela,chave_origem", count: "exact" });
          if (error) erro = error.message;
          else inseridos += count ?? comChave.length;
        }

        if (!erro && semChave.length) {
          const { error, count } = await supabaseAdmin
            .from("integracao_registros")
            .insert(semChave, { count: "exact" });
          if (error) erro = error.message;
          else inseridos += count ?? semChave.length;
        }

        let materializados: number | null = null;
        if (!erro && ["LEITO", "INTERNACAO", "INTER_EVOLUCAO"].includes(tabela)) {
          const { data, error } = await supabaseAdmin.rpc(
            "materializar_integracao_hospitalar" as never,
            { p_lote_id: lote.id } as never,
          );
          if (error) erro = `materializacao_hospitalar: ${error.message}`;
          else materializados = typeof data === "number" ? data : null;
        }
        if (!erro && ["OBSERVACAO", "FICHAATENDIMENTO_EVOLUCAO"].includes(tabela)) {
          const { data, error } = await supabaseAdmin.rpc(
            "materializar_integracao_observacao" as never,
            { p_lote_id: lote.id } as never,
          );
          if (error) erro = `materializacao_observacao: ${error.message}`;
          else materializados = typeof data === "number" ? data : null;
        }

        await supabaseAdmin
          .from("integracao_lotes")
          .update({
            status: erro ? "erro" : "recebido",
            erro_msg: erro,
            total_inseridos: inseridos,
          })
          .eq("id", lote.id);

        if (erro) {
          return jsonRes(
            { ok: false, lote_id: lote.id, error: "falha_ao_gravar", detalhe: erro },
            500,
          );
        }

        return jsonRes({
          ok: true,
          lote_id: lote.id,
          tabela,
          recebidos: registros.length,
          gravados: inseridos,
          materializados,
        });
      },
    },
  },
});
