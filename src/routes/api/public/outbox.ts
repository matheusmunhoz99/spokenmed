import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Access-Control-Max-Age": "86400",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const completeSchema = z.object({
  outbox_ids: z.array(z.string().uuid()).min(1),
});

export const Route = createFileRoute("/api/public/outbox")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      // GET: Busca itens pendentes de atualização para o Firebird
      GET: async ({ request }) => {
        const expected = process.env.INGEST_API_KEY;
        if (!expected) {
          return jsonRes({ ok: false, error: "api_key_nao_configurada" }, 500);
        }
        const provided = request.headers.get("x-api-key") ?? "";
        if (provided.length !== expected.length || provided !== expected) {
          return jsonRes({ ok: false, error: "unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await (supabaseAdmin as any)
          .from("integracao_outbox")
          .select("*")
          .eq("status", "pendente")
          .order("created_at", { ascending: true })
          .limit(500);

        if (error) {
          return jsonRes({ ok: false, error: error.message }, 500);
        }

        return jsonRes({ ok: true, outbox: data ?? [] });
      },

      // POST: Marca itens como processados no Firebird
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

        const parsed = completeSchema.safeParse(raw);
        if (!parsed.success) {
          return jsonRes({ ok: false, error: "payload_invalido" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error } = await supabaseAdmin
          .from("integracao_outbox")
          .update({ status: "processado", processed_at: new Date().toISOString() })
          .in("id", parsed.data.outbox_ids);

        if (error) {
          return jsonRes({ ok: false, error: error.message }, 500);
        }

        return jsonRes({ ok: true, processados: parsed.data.outbox_ids.length });
      },
    },
  },
});
