import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buscarPacienteCpf as lookup } from "./opp-client.server";

export const buscarPacienteCpf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ cpf: z.string().regex(/^\d{11}$/) }).parse(input))
  .handler(async ({ data }) => {
    return await lookup(data.cpf);
  });
