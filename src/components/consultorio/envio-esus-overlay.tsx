"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Step {
  label: string;
  detail: string;
}

const STEPS: Step[] = [
  { label: "Validando CNS do paciente", detail: "Consultando base CADSUS/SUS" },
  { label: "Verificando CNES da unidade", detail: "UBS — CNES 2785143" },
  { label: "Validando INE da equipe", detail: "eSF — INE 0001234567" },
  { label: "Conferindo CBO do profissional", detail: "225125 — Médico clínico" },
  { label: "Montando ficha CDS", detail: "Atendimento Individual v4.3" },
  { label: "Assinando digitalmente", detail: "Certificado ICP-Brasil A3" },
  { label: "Transmitindo ao eSUS PEC", detail: "Protocolo Thrift / TLS 1.3" },
  { label: "Confirmando recebimento (LEDI)", detail: "Lote aceito pelo servidor" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  pacienteNome?: string;
}

export function EnvioEsusOverlay({ open, onClose, pacienteNome }: Props) {
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);
  const [protocolo, setProtocolo] = useState("");

  useEffect(() => {
    if (!open) {
      setCurrent(0);
      setDone(false);
      return;
    }
    setProtocolo(`PEC-${Date.now().toString().slice(-10)}`);
    let i = 0;
    const tick = () => {
      i += 1;
      if (i <= STEPS.length) {
        setCurrent(i);
        if (i < STEPS.length) {
          setTimeout(tick, 650 + Math.random() * 400);
        } else {
          setTimeout(() => setDone(true), 500);
        }
      }
    };
    const t = setTimeout(tick, 400);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-live="polite"
        aria-label="Enviando atendimento ao eSUS PEC"
        className="mx-4 w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {!done ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Enviando ao eSUS PEC</h2>
                <p className="text-xs text-muted-foreground">
                  Transmissão segura · {pacienteNome ?? "Paciente"}
                </p>
              </div>
            </div>

            <ul className="space-y-2.5">
              {STEPS.map((s, idx) => {
                const state =
                  idx < current ? "done" : idx === current ? "active" : "pending";
                return (
                  <li
                    key={s.label}
                    className={`flex items-start gap-3 rounded-lg border p-2.5 transition-colors ${
                      state === "active"
                        ? "border-primary/40 bg-primary/5"
                        : state === "done"
                          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                          : "border-border/60 bg-muted/20 opacity-60"
                    }`}
                  >
                    <div className="mt-0.5 h-4 w-4 shrink-0">
                      {state === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : state === "active" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <div className="h-2 w-2 translate-x-1 translate-y-1 rounded-full bg-muted-foreground/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-tight">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground">{s.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${(current / STEPS.length) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <div className="py-2 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">
              Atendimento finalizado com sucesso
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ficha CDS transmitida e aceita pelo eSUS PEC.
            </p>
            <div className="mx-auto mt-4 max-w-xs rounded-lg border bg-muted/30 p-3 text-left text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Protocolo</span>
                <span className="font-mono font-medium">{protocolo}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Lote</span>
                <span className="font-mono">LEDI-{new Date().toISOString().slice(0, 10)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium text-emerald-600">Aceito</span>
              </div>
            </div>
            <Button className="mt-5 w-full" onClick={onClose}>
              Fechar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
