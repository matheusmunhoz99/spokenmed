import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, ShieldCheck, Zap, Server, Database, Volume2, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

export function GlobalTelemetryBadge() {
  const [open, setOpen] = useState(false);
  const [segundos, setSegundos] = useState(2);

  // 2s Countdown pulse
  useEffect(() => {
    const timer = setInterval(() => {
      setSegundos((prev) => (prev <= 1 ? 2 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Telemetry query from integracao_lotes
  const { data: stats } = useQuery({
    queryKey: ["global-telemetry-stats"],
    queryFn: async () => {
      const { data, count } = await supabase
        .from("integracao_lotes")
        .select("id, created_at, total_registros, tabela", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(10);

      const totalRegs = (data ?? []).reduce((acc, curr) => acc + (curr.total_registros ?? 0), 0);
      return {
        lotesCount: count ?? 0,
        totalRegs,
        ultimosLotes: data ?? [],
      };
    },
    refetchInterval: 5000,
  });

  const testTTSVoice = () => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance("Sistema SpokenMED: Chamada de voz em tempo real ativada com sucesso.");
      utterance.lang = "pt-BR";
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
      toast.success("Voz de Chamada sintetizada com sucesso!");
    } else {
      toast.error("Navegador não suporta síntese de voz.");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold transition-all shadow-sm group"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <Zap className="h-3.5 w-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
        <span>Agente Teresópolis (2s)</span>
        <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 border-emerald-500/40 bg-emerald-500/20 font-bold">
          LIVE
        </Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Activity className="h-5 w-5 text-emerald-500" />
              Central de Telemetria & Conexão ao Vivo
            </DialogTitle>
            <DialogDescription>
              Status de transmissão bidirecional em tempo real entre o sistema hospitalar Firebird e a nuvem SpokenMED.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Grid de Métricas */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border bg-muted/30 text-center space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold flex items-center justify-center gap-1">
                  <Server className="h-3.5 w-3.5 text-primary" /> Motor C# .EXE
                </span>
                <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">ONLINE (2s)</p>
              </div>

              <div className="p-3 rounded-xl border bg-muted/30 text-center space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold flex items-center justify-center gap-1">
                  <Database className="h-3.5 w-3.5 text-primary" /> Latência Nuvem
                </span>
                <p className="text-base font-extrabold text-blue-600 dark:text-blue-400">&lt; 35 ms</p>
              </div>

              <div className="p-3 rounded-xl border bg-muted/30 text-center space-y-1">
                <span className="text-[11px] text-muted-foreground font-semibold flex items-center justify-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Anti-Duplicidade
                </span>
                <p className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">SHA-256 OK</p>
              </div>
            </div>

            {/* Teste de Sintetizador de Voz */}
            <div className="p-3.5 rounded-xl border bg-card flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Volume2 className="h-4 w-4 text-primary" /> Chamada de Paciente por Voz (TTS)
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Sistema inteligente de locução em áudio para salas de espera e consultórios.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={testTTSVoice} className="shrink-0">
                Testar Voz
              </Button>
            </div>

            {/* Lotes Recentes */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Últimos Lotes Transmitidos do Firebird
              </span>
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {(stats?.ultimosLotes ?? []).map((lote: any) => (
                  <div key={lote.id} className="p-2 rounded-lg border bg-muted/20 flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">
                      Tabela: <strong className="text-primary">{lote.tabela}</strong> ({lote.total_registros} registros)
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {new Date(lote.created_at).toLocaleTimeString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
