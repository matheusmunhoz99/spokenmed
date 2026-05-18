import { createFileRoute } from "@tanstack/react-router";

// Gerado quando o Worker carrega este módulo (ou seja, em cada novo deploy).
// O cliente compara esse valor periodicamente para detectar nova versão.
const BUILD_ID = Date.now().toString();

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ buildId: BUILD_ID }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, must-revalidate",
          },
        });
      },
    },
  },
});
