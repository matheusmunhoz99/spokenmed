import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Reduz refetches agressivos: dados ficam frescos por 30s
        staleTime: 30_000,
        // Mantém em cache 5 min após o último uso
        gcTime: 5 * 60_000,
        // Não refetch ao focar a janela (UX mais estável)
        refetchOnWindowFocus: false,
        // Retry com backoff em falhas transitórias de rede
        retry: (failureCount, error) => {
          // Não retry para erros de auth/permission (4xx)
          const msg = (error as Error)?.message?.toLowerCase() ?? "";
          if (msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("not found")) {
            return false;
          }
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        // Mutations: 1 retry só para erros de rede
        retry: (failureCount, error) => {
          const msg = (error as Error)?.message?.toLowerCase() ?? "";
          if (msg.includes("network") || msg.includes("fetch")) {
            return failureCount < 1;
          }
          return false;
        },
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Pré-carrega rotas no hover para navegação instantânea
    defaultPreload: "intent",
  });

  return router;
};
