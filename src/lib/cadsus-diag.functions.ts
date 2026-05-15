import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buscarPacienteCpfWithTrace, clearOppSessionCache } from "./opp-client.server";

// Diagnostic endpoint — runs the full flow and returns the masked trace.
// Restricted to authenticated users.
export const diagnoseCadSus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      cpf: z.string().regex(/^\d{11}$/),
      forceLogin: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    if (data.forceLogin) clearOppSessionCache();
    const env = {
      OPP_BASE_URL: !!process.env.OPP_BASE_URL,
      OPP_USERNAME: !!process.env.OPP_USERNAME,
      OPP_PASSWORD: !!process.env.OPP_PASSWORD,
      baseUrlValue: process.env.OPP_BASE_URL ?? null, // URL não é segredo
    };
    const { result, trace } = await buscarPacienteCpfWithTrace(data.cpf);
    return { env, result, trace };
  });
