import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAllowedUnidades } from "@/hooks/use-allowed-unidades";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Maximize2, Volume2, VolumeX, MonitorPlay, LogOut, ShieldAlert, Loader2 } from "lucide-react";
import logo from "@/assets/spokenmed-logo.png";

export const Route = createFileRoute("/painel")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: PainelFullscreen,
});

type Chamada = {
  id: string;
  paciente_nome: string;
  profissional_nome: string | null;
  sala: string | null;
  unidade_id: string;
  chamado_em: string;
};

const STORAGE_KEY = "painel_unidade_id";

function PainelFullscreen() {
  const navigate = useNavigate();
  const { profile, user, can, loading } = useAuth();
  const { data: unidades, isLoading: unidadesLoading } = useAllowedUnidades();
  const [unidadeId, setUnidadeId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STORAGE_KEY) ?? "";
  });
  const [audioOn, setAudioOn] = useState(false);
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  const [now, setNow] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const audioOnRef = useRef(false);
  audioOnRef.current = audioOn;

  // Relógio
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-seleciona primeira unidade
  useEffect(() => {
    if (!unidadeId && unidades && unidades.length > 0) {
      setUnidadeId((unidades[0] as any).id);
    } else if (unidadeId && unidades && unidades.length > 0) {
      const ok = unidades.some((u: any) => u.id === unidadeId);
      if (!ok) setUnidadeId((unidades[0] as any).id);
    }
  }, [unidades, unidadeId]);

  useEffect(() => {
    if (unidadeId) localStorage.setItem(STORAGE_KEY, unidadeId);
  }, [unidadeId]);

  // Carga inicial
  useQuery({
    queryKey: ["painel-fs", unidadeId],
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
      .channel(`painel-fs-${unidadeId}`)
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
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch { /* noop */ }
    setAudioOn(true);
  };

  const fullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  if (loading || unidadesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando painel…
      </div>
    );
  }

  if (!can("painel")) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 p-10 text-center text-slate-200">
        <ShieldAlert className="h-12 w-12 text-amber-400" />
        <div className="text-2xl font-semibold">Acesso restrito</div>
        <p className="max-w-md text-sm text-slate-400">
          Você não tem permissão para usar o Painel de Chamada. Peça ao administrador para liberar em
          Configurações → Usuários.
        </p>
        <Button asChild variant="outline">
          <Link to="/app">Voltar ao sistema</Link>
        </Button>
      </div>
    );
  }

  if (!unidades || unidades.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 p-10 text-center text-slate-200">
        <MonitorPlay className="h-12 w-12 text-primary" />
        <div className="text-2xl font-semibold">Nenhuma unidade vinculada</div>
        <p className="max-w-md text-sm text-slate-400">
          Seu usuário não tem unidades atribuídas. Peça ao administrador para vincular ao menos uma unidade.
        </p>
        <Button asChild variant="outline"><Link to="/app">Voltar ao sistema</Link></Button>
      </div>
    );
  }

  const ultima = chamadas[0];
  const anteriores = chamadas.slice(1, 6);
  const unidadeNome = (unidades.find((u: any) => u.id === unidadeId) as any)?.nome ?? "—";

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-screen w-screen flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_hsl(180_70%_22%),_hsl(180_75%_12%))] text-slate-50"
    >
      {/* glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[60rem] -translate-x-1/2 rounded-full bg-primary/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />

      {/* Top bar */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/95 p-1.5 shadow-md">
            <img src={logo} alt="SpokenMED" className="h-full w-full object-contain" />
          </div>
          <div className="leading-tight">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">SpokenMED</div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <MonitorPlay className="h-5 w-5 text-cyan-300" /> Painel de Chamada
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={unidadeId} onValueChange={setUnidadeId}>
            <SelectTrigger className="h-10 w-[240px] border-white/20 bg-white/10 text-white">
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              {unidades.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={ativarAudio} className="h-10 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            {audioOn ? <Volume2 className="mr-1.5 h-4 w-4 text-emerald-300" /> : <VolumeX className="mr-1.5 h-4 w-4" />}
            {audioOn ? "Som ativo" : "Ativar som"}
          </Button>
          <Button variant="outline" size="sm" onClick={fullscreen} className="h-10 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            <Maximize2 className="mr-1.5 h-4 w-4" /> Tela cheia
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app" })} className="h-10 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            <LogOut className="mr-1.5 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      {!audioOn && (
        <div className="relative z-10 mx-6 mt-4 flex items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm text-amber-50">
          <Volume2 className="h-4 w-4" />
          Clique em <strong>Ativar som</strong> para o painel anunciar os pacientes em voz alta.
        </div>
      )}

      {/* Conteúdo */}
      <main className="relative z-10 grid flex-1 gap-6 p-6 lg:grid-cols-[1.7fr_1fr]">
        {/* Última chamada */}
        <section
          aria-live="assertive"
          aria-atomic="true"
          key={ultima?.id ?? "vazio"}
          className="flex flex-col justify-center rounded-3xl border border-white/15 bg-white/[0.07] p-10 shadow-2xl backdrop-blur-xl"
          style={{ animation: ultima ? "painelIn 700ms cubic-bezier(.2,.8,.2,1)" : undefined }}
        >
          {ultima ? (
            <>
              <div className="text-xs font-semibold uppercase tracking-[0.4em] text-cyan-300/90">Próximo paciente</div>
              <div className="mt-4 text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-7xl xl:text-8xl">
                {ultima.paciente_nome}
              </div>
              {ultima.sala ? (
                <div className="mt-8 text-3xl text-white/90 sm:text-5xl">
                  Dirija-se à{" "}
                  <span className="ml-1 inline-block rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 px-5 py-2 font-black text-slate-900 shadow-lg">
                    Sala {ultima.sala}
                  </span>
                </div>
              ) : (
                <div className="mt-8 text-2xl text-white/70 sm:text-3xl">Por favor, dirija-se à recepção</div>
              )}
              <div className="mt-8 flex flex-wrap items-center gap-3 text-base text-white/80">
                {ultima.profissional_nome && (
                  <span className="rounded-full bg-white/10 px-4 py-1.5">{ultima.profissional_nome}</span>
                )}
                <span className="rounded-full bg-white/10 px-4 py-1.5">
                  {new Date(ultima.chamado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <MonitorPlay className="h-16 w-16 text-white/30" />
              <div className="text-3xl font-semibold text-white/70">Aguardando chamadas…</div>
              <div className="text-sm text-white/50">As chamadas aparecerão aqui em tempo real.</div>
            </div>
          )}
        </section>

        {/* Histórico + Relógio */}
        <aside className="flex flex-col gap-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 text-center backdrop-blur-xl">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">{unidadeNome}</div>
            <div className="mt-2 font-mono text-5xl font-bold tabular-nums text-white sm:text-6xl">
              {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="mt-1 text-sm capitalize text-white/60">
              {now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>

          <div className="flex-1 rounded-3xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
              Chamadas anteriores
            </div>
            {anteriores.length === 0 ? (
              <div className="py-8 text-center text-sm text-white/50">Nenhuma ainda.</div>
            ) : (
              <ul className="space-y-2">
                {anteriores.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.04] px-4 py-3 transition hover:bg-white/[0.08]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-white">{c.paciente_nome}</div>
                      <div className="truncate text-xs text-white/60">
                        {c.sala ? `Sala ${c.sala}` : "—"}
                        {c.profissional_nome ? ` · ${c.profissional_nome}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-white/60 tabular-nums">
                      {new Date(c.chamado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/20 px-6 py-2 text-xs text-white/60">
        <span>Operador: <strong className="text-white/80">{profile?.nome || user?.email}</strong></span>
        <span>SpokenMED · Painel de Chamada</span>
      </footer>

      <style>{`
        @keyframes painelIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
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
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.18);
      setTimeout(() => { speak(); setTimeout(speak, 1600); }, 350);
    } catch {
      speak();
      setTimeout(speak, 1600);
    }
  } catch { /* ignore */ }
}
