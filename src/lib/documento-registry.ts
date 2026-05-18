import { supabase } from "@/integrations/supabase/client";

export type DocumentoTipo = "receita" | "atestado" | "sadt" | "lme" | "comprovante";

function maskCpf(cpf?: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export interface RegistrarDocumentoInput {
  protocolo: string;
  tipo: DocumentoTipo;
  paciente: { nome: string; cpf?: string | null };
  profissional: { nome: string; crm?: string | null; uf?: string | null; cbo?: string | null };
  unidade?: { id?: string | null; nome?: string | null; cnes?: string | null };
  agendamento_id?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Registra a emissão de um documento para verificação pública pelo protocolo.
 * Falha silenciosamente — o PDF deve abrir mesmo se o registro falhar.
 */
export async function registrarDocumento(input: RegistrarDocumentoInput): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const conselho = input.profissional.crm
      ? `${input.profissional.crm}${input.profissional.uf ? "/" + input.profissional.uf : ""}`
      : null;

    await supabase.from("documentos_emitidos").insert({
      protocolo: input.protocolo,
      tipo: input.tipo,
      paciente_nome: input.paciente.nome,
      paciente_cpf_mask: maskCpf(input.paciente.cpf ?? null),
      profissional_nome: input.profissional.nome,
      profissional_conselho: conselho,
      profissional_cbo: input.profissional.cbo ?? null,
      unidade_nome: input.unidade?.nome ?? null,
      unidade_cnes: input.unidade?.cnes ?? null,
      unidade_id: input.unidade?.id ?? null,
      agendamento_id: input.agendamento_id ?? null,
      metadata: (input.metadata ?? {}) as never,
      emitido_por: user?.id ?? null,
      emitido_por_email: user?.email ?? null,
    });
  } catch (err) {
    // Não interrompe a geração do PDF
    console.warn("registrarDocumento falhou:", err);
  }
}
