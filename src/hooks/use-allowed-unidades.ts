import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Retorna as unidades acessíveis para o usuário logado.
 * - Admin: todas as unidades ativas.
 * - Recepcionista: apenas as unidades vinculadas via user_unidades (RLS já filtra).
 */
export function useAllowedUnidades() {
  const { isAdmin, user } = useAuth();

  return useQuery({
    queryKey: ["allowed-unidades", user?.id, isAdmin],
    enabled: !!user,
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("unidades")
          .select("id, nome")
          .eq("ativo", true)
          .order("nome");
        if (error) throw error;
        return data ?? [];
      }
      // RLS de user_unidades restringe ao próprio usuário; juntamos com unidades
      const { data, error } = await supabase
        .from("user_unidades")
        .select("unidade_id, unidades(id, nome, ativo)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.unidades)
        .filter((u: any) => u && u.ativo)
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
    },
  });
}
