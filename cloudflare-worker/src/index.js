// Cloudflare Worker: spokenmed
// Endpoint público (com api key) que o app Lovable chama pra consultar CPF
// no sistema Fiorilli/OPP (uniGUI).
//
// Rotas:
//   GET  /health                         → 200 ok (sem auth)
//   GET  /cpf?cpf=12345678900            → { ok, dados } | { ok:false, error }
//                                          requer header: x-api-key: <API_KEY>
//
// Secrets/env esperados:
//   OPP_BASE_URL   ex: https://oppcloud.com.br
//   OPP_USERNAME
//   OPP_PASSWORD
//   API_KEY        string aleatória que o app envia em x-api-key
//
// Bindings esperados (wrangler.jsonc):
//   BROWSER        Browser Rendering
//   FIORILLI_DO    Durable Object → classe FiorilliDO

export { FiorilliDO } from "./fiorilli-do.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "x-api-key,content-type",
      "access-control-allow-methods": "GET,OPTIONS",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "x-api-key,content-type",
          "access-control-allow-methods": "GET,OPTIONS",
        },
      });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, ts: Date.now(), build: "fiorilli-debug-v5" });
    }

    if (url.pathname === "/reset") {
      const provided =
        request.headers.get("x-api-key") || url.searchParams.get("api_key") || "";
      if (!env.API_KEY || provided !== env.API_KEY) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      const id = env.FIORILLI_DO.idFromName("global");
      const stub = env.FIORILLI_DO.get(id);
      const res = await stub.fetch(new Request("https://do/reset", { method: "POST" }));
      return new Response(await res.text(), {
        status: res.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname === "/cpf") {
      // Auth
      const provided =
        request.headers.get("x-api-key") || url.searchParams.get("api_key") || "";
      if (!env.API_KEY || provided !== env.API_KEY) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }

      const cpf = (url.searchParams.get("cpf") || "").replace(/\D/g, "");
      if (cpf.length !== 11) {
        return json({ ok: false, error: "cpf_invalido" }, 400);
      }

      if (!env.OPP_BASE_URL || !env.OPP_USERNAME || !env.OPP_PASSWORD) {
        return json({ ok: false, error: "config_ausente" }, 500);
      }
      if (!env.BROWSER) {
        return json({ ok: false, error: "browser_indisponivel" }, 500);
      }
      if (!env.FIORILLI_DO) {
        return json({ ok: false, error: "durable_object_ausente" }, 500);
      }

      try {
        const id = env.FIORILLI_DO.idFromName("global");
        const stub = env.FIORILLI_DO.get(id);
        const res = await stub.fetch(
          new Request(`https://do/lookup?cpf=${cpf}`, { method: "GET" }),
        );
        const body = await res.text();
        return new Response(body, {
          status: res.status,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
          },
        });
      } catch (err) {
        console.error("[worker] erro chamando DO:", err?.stack || err);
        return json({ ok: false, error: "rede", detail: String(err?.message || err) }, 500);
      }
    }

    return json({ ok: false, error: "not_found" }, 404);
  },
};
