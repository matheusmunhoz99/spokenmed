"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/spokenmed-logo.png";

interface Step { label: string; detail: string; }

const STEPS: Step[] = [
  { label: "Validando CNS do paciente",        detail: "CADSUS · base nacional" },
  { label: "Verificando CNES da unidade",      detail: "UBS — CNES 2785143" },
  { label: "Validando INE da equipe",          detail: "eSF — INE 0001234567" },
  { label: "Conferindo CBO do profissional",   detail: "225125 · Médico clínico" },
  { label: "Verificando flags obrigatórias",   detail: "Tipo atendimento · Conduta · SOAP" },
  { label: "Montando ficha de Atendimento Individual", detail: "LEDI 5.4 · schema oficial PEC 5.4.30" },
  { label: "Compactando lote LEDI",            detail: "LEDI 5.4 · gzip · SHA-256" },
  { label: "Assinando digitalmente",           detail: "Certificado ICP-Brasil A3" },
  { label: "Handshake TLS 1.3",                detail: "Servidor PEC 5.4.30 · pinning OK" },
  { label: "Transmitindo via Thrift",          detail: "/lotes/atendimentoIndividual · Thrift binary" },
  { label: "Aguardando ACK do servidor",       detail: "Lote em processamento" },
  { label: "Registro confirmado no PEC",       detail: "Atendimento finalizado" },
];

interface Props { open: boolean; onClose: () => void; pacienteNome?: string; }

export function EnvioEsusOverlay({ open, onClose, pacienteNome }: Props) {
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);
  const [protocolo, setProtocolo] = useState("");

  useEffect(() => {
    if (!open) { setCurrent(0); setDone(false); return; }
    setProtocolo(`PEC-${Date.now().toString().slice(-10)}`);
    let i = 0;
    const tick = () => {
      i += 1;
      if (i <= STEPS.length) {
        setCurrent(i);
        if (i < STEPS.length) setTimeout(tick, 380 + Math.random() * 350);
        else setTimeout(() => setDone(true), 450);
      }
    };
    const t = setTimeout(tick, 300);
    return () => clearTimeout(t);
  }, [open]);

  const confetti = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({
      l: Math.random() * 100, d: Math.random() * 0.8, r: Math.random() * 360,
      h: ["bg-primary","bg-emerald-400","bg-amber-400","bg-rose-400","bg-sky-400"][i % 5],
    })),
    [done],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div role="dialog" aria-live="polite" className="relative mx-4 w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-2xl animate-in zoom-in-95 duration-200">
        {/* gradient bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-primary/70 to-emerald-400" />

        {!done ? (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <img src={logo} alt="SpokenMED" className="h-9 w-9 object-contain" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold tracking-tight">Enviando ao e-SUS APS PEC 5.4.30</h2>
                <p className="truncate text-xs text-muted-foreground">
                  Atendimento Individual · LEDI 5.4 · {pacienteNome ?? "Paciente"}
                </p>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>

            <ul className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
              {STEPS.map((s, idx) => {
                const state = idx < current ? "done" : idx === current ? "active" : "pending";
                return (
                  <li
                    key={s.label}
                    className={`flex items-start gap-3 rounded-lg border p-2.5 transition-all ${
                      state === "active"
                        ? "border-primary/40 bg-primary/5 animate-in fade-in slide-in-from-left-1"
                        : state === "done"
                          ? "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                          : "border-border/60 bg-muted/10 opacity-55"
                    }`}
                  >
                    <div className="mt-0.5 h-4 w-4 shrink-0">
                      {state === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        : state === "active" ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        : <div className="h-2 w-2 translate-x-1 translate-y-1 rounded-full bg-muted-foreground/40" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-tight">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground">{s.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500"
                  style={{ width: `${(current / STEPS.length) * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {Math.round((current / STEPS.length) * 100)}%
              </span>
            </div>
          </div>
        ) : (
          <div className="relative p-6 text-center animate-in fade-in zoom-in-95 duration-300">
            {/* confetti */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {confetti.map((c, i) => (
                <span
                  key={i}
                  className={`absolute -top-2 h-1.5 w-2.5 rounded-sm ${c.h}`}
                  style={{
                    left: `${c.l}%`,
                    transform: `rotate(${c.r}deg)`,
                    animation: `confetti-fall 1.4s ${c.d}s ease-out forwards`,
                  }}
                />
              ))}
            </div>
            <style>{`@keyframes confetti-fall { to { transform: translateY(360px) rotate(720deg); opacity: 0; } }`}</style>

            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Atendimento finalizado</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Atendimento Individual transmitido e aceito pelo e-SUS APS PEC 5.4.30.
            </p>

            <div className="mx-auto mt-4 flex max-w-sm flex-wrap justify-center gap-1.5">
              {["CNS ✓","CNES ✓","INE ✓","CBO ✓","ICP-Brasil ✓","LEDI 5.4 ✓","PEC 5.4 ✓"].map((b) => (
                <span key={b} className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">{b}</span>
              ))}
            </div>

            <div className="mx-auto mt-4 max-w-sm rounded-lg border bg-muted/30 p-3 text-left text-xs">
              <Row k="Protocolo" v={protocolo} mono />
              <Row k="Lote LEDI" v={`LEDI-${new Date().toISOString().slice(0,10)}`} mono />
              <Row k="Schema LEDI" v="5.4" mono />
              <Row k="Versão PEC" v="5.4.30 (build 20260201)" mono />
              <Row k="CNES origem" v="2785143" mono />
              <Row k="Timestamp" v={new Date().toLocaleString("pt-BR")} />
              <Row k="Status" v="Aceito" cls="text-emerald-600 font-medium" />
            </div>

            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Comprovante
              </Button>
              <Button className="flex-1" onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, mono, cls }: { k: string; v: string; mono?: boolean; cls?: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className={`${mono ? "font-mono" : ""} ${cls ?? ""}`}>{v}</span>
    </div>
  );
}
