import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { SemAcesso } from "@/components/sem-acesso";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Maximize2, Volume2, VolumeX, MonitorPlay } from "lucide-react";

function PainelGuard() {
  const { can } = useAuth();
  if (!can("painel")) return <SemAcesso />;
  return <PainelPage />;
}
export const Route = createFileRoute("/app/painel")({ component: PainelGuard });

type Chamada = {
  id: string;
  paciente_nome: string;
  profissional_nome: string | null;
  sala: string | null;
  unidade_id: string;
  chamado_em: string;
};

const STORAGE_KEY = "painel_unidade_id";

function PainelPage() {
  const { data: unidades } = useAllowedUnidades();
  const [unidadeId, setUnidadeId] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [audioOn, setAudioOn] = useState(false);
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioOnRef = useRef(false);
  audioOnRef.current = audioOn;

  useEffect(() => {
    if (!unidadeId && unidades && unidades.length > 0) {
      setUnidadeId((unidades[0] as any).id);
    }
  }, [unidades, unidadeId]);

  useEffect(() => {
    if (unidadeId) localStorage.setItem(STORAGE_KEY, unidadeId);
  }, [unidadeId]);

  // Carga inicial
  useQuery({
    queryKey: ["chamadas-painel", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("chamadas" as any)
        .select("*")
        .eq("unidade_id", unidadeId)
        .order("chamado_em", { ascending: false })
        .limit(8);
      setChamadas((data as any) ?? []);
      return data;
    },
  });

  // Realtime
  useEffect(() => {
    if (!unidadeId) return;
    const channel = supabase
      .channel(`chamadas-${unidadeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chamadas", filter: `unidade_id=eq.${unidadeId}` },
        (payload) => {
          const novo = payload.new as Chamada;
          setChamadas((prev) => [novo, ...prev].slice(0, 8));
          if (audioOnRef.current) anunciar(novo);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [unidadeId]);

  const ativarAudio = () => {
    // truque pra desbloquear speechSynthesis após interação do usuário
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
      setAudioOn(true);
    } catch {
      setAudioOn(true);
    }
  };

  const fullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const ultima = chamadas[0];
  const anteriores = chamadas.slice(1, 6);

  return (
    <div ref={containerRef} className="relative -mx-3 -my-4 min-h-[calc(100vh-8rem)] bg-gradient-to-br from-primary via-primary to-[hsl(180_70%_18%)] p-4 text-primary-foreground sm:-mx-4 sm:-my-6 sm:p-8">
      {/* Top bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary-foreground/90">
          <MonitorPlay className="h-6 w-6" />
          <span className="text-lg font-semibold tracking-wide">Painel de Chamada</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={unidadeId} onValueChange={setUnidadeId}>
            <SelectTrigger className="h-9 w-[220px] border-white/20 bg-white/10 text-primary-foreground"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
            <SelectContent>
              {unidades?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={ativarAudio} className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20">
            {audioOn ? <Volume2 className="mr-1 h-4 w-4" /> : <VolumeX className="mr-1 h-4 w-4" />}
            {audioOn ? "Som ativo" : "Ativar som"}
          </Button>
          <Button variant="outline" size="sm" onClick={fullscreen} className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20">
            <Maximize2 className="mr-1 h-4 w-4" /> Tela cheia
          </Button>
        </div>
      </div>

      {!audioOn && (
        <div className="mb-4 rounded-md border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm text-amber-50">
          Clique em <strong>Ativar som</strong> para o painel anunciar os pacientes em voz alta.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Última chamada */}
        <div
          aria-live="assertive"
          className="flex min-h-[420px] flex-col justify-center rounded-2xl bg-white/10 p-8 shadow-2xl ring-1 ring-white/15 backdrop-blur transition-all"
          key={ultima?.id ?? "vazio"}
          style={{ animation: ultima ? "painelIn 600ms ease-out" : undefined }}
        >
          {ultima ? (
            <>
              <div className="text-sm uppercase tracking-[0.3em] text-primary-foreground/70">Próximo paciente</div>
              <div className="mt-3 text-5xl font-bold leading-tight sm:text-7xl">{ultima.paciente_nome}</div>
              {ultima.sala && (
                <div className="mt-6 text-3xl sm:text-5xl">
                  Dirija-se à <span className="rounded-lg bg-white/15 px-3 py-1 font-bold text-white">Sala {ultima.sala}</span>
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-3 text-base text-primary-foreground/80">
                {ultima.profissional_nome && <span className="rounded-full bg-white/10 px-3 py-1">{ultima.profissional_nome}</span>}
                <span>{new Date(ultima.chamado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </>
          ) : (
            <div className="text-center text-2xl text-primary-foreground/70">Aguardando chamadas…</div>
          )}
        </div>

        {/* Histórico */}
        <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          <div className="mb-3 text-sm uppercase tracking-[0.2em] text-primary-foreground/70">Chamadas anteriores</div>
          {anteriores.length === 0 ? (
            <div className="py-6 text-center text-sm text-primary-foreground/60">Nenhuma ainda.</div>
          ) : (
            <ul className="space-y-2">
              {anteriores.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{c.paciente_nome}</div>
                    <div className="truncate text-xs text-primary-foreground/70">{c.sala ? `Sala ${c.sala}` : "—"}{c.profissional_nome ? ` · ${c.profissional_nome}` : ""}</div>
                  </div>
                  <span className="shrink-0 text-xs text-primary-foreground/60">
                    {new Date(c.chamado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <style>{`
        @keyframes painelIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function anunciar(c: Chamada) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const frase = c.sala
      ? `Paciente ${c.paciente_nome}, dirija-se à sala ${c.sala}.`
      : `Paciente ${c.paciente_nome}, por favor.`;
    const speak = () => {
      const u = new SpeechSynthesisUtterance(frase);
      u.lang = "pt-BR";
      u.rate = 0.95;
      const voices = synth.getVoices();
      const pt = voices.find((v) => v.lang?.toLowerCase().startsWith("pt"));
      if (pt) u.voice = pt;
      synth.speak(u);
    };
    // bip curto antes
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.18);
      setTimeout(() => { speak(); setTimeout(speak, 1400); }, 350);
    } catch {
      speak();
      setTimeout(speak, 1400);
    }
  } catch {
    /* ignore */
  }
}
