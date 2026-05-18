import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { z } from "zod";
import {
  Camera, CheckCircle2, Copy, FileText, Search, ShieldAlert, ShieldCheck,
  Stethoscope, Clock, Eye, Share2, AlertTriangle, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/spokenmed-logo.png";

const QrScannerDialog = lazy(() => import("@/components/verificar/qr-scanner-dialog"));

function extrairProtocolo(input: string): string {
  const s = input.trim();
  if (!s) return "";
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const p = u.searchParams.get("p");
      if (p) return p.trim().toUpperCase();
    }
  } catch { /* noop */ }
  const m = s.match(/[?&]p=([^&\s]+)/i);
  if (m) return decodeURIComponent(m[1]).toUpperCase();
  return s.toUpperCase();
}

const searchSchema = z.object({ p: z.string().optional() });

export const Route = createFileRoute("/verificar")({
  validateSearch: searchSchema,
  component: VerificarPage,
  head: () => ({
    meta: [
      { title: "Verificar documento · SpokenMED" },
      { name: "description", content: "Verifique a autenticidade de um documento médico emitido pelo SpokenMED informando o código do protocolo." },
    ],
  }),
});

interface EventoConsulta {
  consultado_em: string;
  user_agent_resumo: string | null;
  ip_mask: string | null;
}

interface Documento {
  protocolo: string;
  tipo: string;
  paciente_nome_iniciais: string;
  paciente_cpf_mask: string | null;
  profissional_nome: string;
  profissional_conselho: string | null;
  unidade_nome: string | null;
  unidade_cnes: string | null;
  emitido_em: string;
  assinatura: string | null;
  assinado_em: string | null;
  consultas_24h: number | null;
  consultas_total: number | null;
  ultima_consulta: string | null;
  eventos: EventoConsulta[] | null;
}

const TIPO_LABEL: Record<string, string> = {
  receita: "Receita Médica",
  atestado: "Atestado Médico",
  sadt: "Guia SADT (Exames)",
  lme: "LME — Alto Custo",
  comprovante: "Comprovante de Agendamento",
};

const TIPO_ICON: Record<string, string> = {
  receita: "💊", atestado: "📋", sadt: "🧪", lme: "💉", comprovante: "📅",
};

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function VerificarPage() {
  const navigate = useNavigate({ from: "/verificar" });
  const search = Route.useSearch();
  const [codigo, setCodigo] = useState(search.p ?? "");
  const [loading, setLoading] = useState(false);
  const [doc, setDoc] = useState<Documento | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const consultar = async (proto: string) => {
    const p = extrairProtocolo(proto);
    if (!p) return;
    setLoading(true); setDoc(null); setNotFound(false); setErro(null);
    try {
      const { data, error } = await supabase.rpc("verificar_documento", { p_protocolo: p });
      if (error) throw error;
      if (!data || data.length === 0) setNotFound(true);
      else setDoc(data[0] as unknown as Documento);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao consultar.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (search.p && search.p.trim()) {
      setCodigo(search.p); consultar(search.p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = extrairProtocolo(codigo);
    setCodigo(p);
    navigate({ search: { p }, replace: true });
    consultar(p);
  };

  const handleScanned = (text: string) => {
    const p = extrairProtocolo(text);
    setScannerOpen(false); setCodigo(p);
    navigate({ search: { p }, replace: true });
    consultar(p);
  };

  const copiarProtocolo = async () => {
    if (!doc) return;
    try { await navigator.clipboard.writeText(doc.protocolo); toast.success("Protocolo copiado"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  const compartilhar = async () => {
    if (!doc) return;
    const url = `${window.location.origin}/verificar?p=${encodeURIComponent(doc.protocolo)}`;
    const titulo = `Verificação SpokenMED · ${doc.protocolo}`;
    try {
      if (navigator.share) await navigator.share({ title: titulo, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copiado"); }
    } catch { /* user cancelou */ }
  };

  const consultas24h = doc?.consultas_24h ?? 0;
  const alertaFraude = consultas24h > 20;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/[0.04] via-background to-emerald-400/[0.04]">
      <header className="border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <img src={logoUrl} alt="SpokenMED" className="h-9 w-9 object-contain" />
          <div>
            <h1 className="text-base font-semibold leading-tight">SpokenMED</h1>
            <p className="text-xs text-muted-foreground">Verificação de autenticidade</p>
          </div>
          <Badge variant="outline" className="ml-auto gap-1 border-emerald-300 bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-3 w-3" /> Portal público
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {/* Card de consulta */}
        <div className="rounded-2xl border bg-card p-5 sm:p-6 shadow-sm">
          <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Verificação de documento
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Confirme a autenticidade</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe o código do protocolo impresso no rodapé do documento ou aponte a câmera para o QR code.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="proto" className="sr-only">Protocolo</Label>
              <Input
                id="proto" value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="Ex.: RECT-A8K2QR-X3LM"
                className="font-mono uppercase tracking-wide"
                autoCapitalize="characters" inputMode="text" autoFocus
              />
            </div>
            <Button type="button" variant="outline" onClick={() => setScannerOpen(true)} className="gap-2">
              <Camera className="h-4 w-4" />
              <span className="sm:hidden">Escanear QR</span><span className="hidden sm:inline">QR</span>
            </Button>
            <Button type="submit" disabled={loading || !codigo.trim()} className="gap-2">
              <Search className="h-4 w-4" />
              {loading ? "Consultando…" : "Verificar"}
            </Button>
          </form>
        </div>

        {scannerOpen && (
          <Suspense fallback={null}>
            <QrScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScanned} />
          </Suspense>
        )}

        {/* HERO de status — colorido grande */}
        {doc && (
          <div className="mt-6 overflow-hidden rounded-3xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-xl animate-in fade-in slide-in-from-bottom-3">
            <div className="px-6 py-8 sm:px-10 sm:py-10">
              <div className="flex items-start gap-4">
                <div className="grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur ring-1 ring-white/30">
                  <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-emerald-100/90 font-semibold">
                    Resultado da verificação
                  </div>
                  <div className="mt-1 text-2xl sm:text-4xl font-extrabold leading-tight tracking-tight">
                    DOCUMENTO AUTÊNTICO
                  </div>
                  <div className="mt-2 text-sm sm:text-base text-emerald-50/95">
                    {TIPO_LABEL[doc.tipo] ?? doc.tipo} emitido e registrado oficialmente pelo SpokenMED.
                  </div>
                </div>
                <div className="hidden sm:block text-5xl" aria-hidden>{TIPO_ICON[doc.tipo] ?? "📄"}</div>
              </div>

              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <StatChip icon={Clock} label="Emitido" value={tempoRelativo(doc.emitido_em)} />
                <StatChip icon={Eye} label="Consultas 24h" value={String(consultas24h)} />
                <StatChip icon={History} label="Total" value={String(doc.consultas_total ?? 0)} />
                <StatChip icon={ShieldCheck} label="Assinatura" value={doc.assinatura ? "Válida" : "—"} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-white/15 bg-black/10 px-6 py-3">
              <Button size="sm" variant="secondary" onClick={copiarProtocolo} className="gap-1.5 bg-white text-emerald-700 hover:bg-emerald-50">
                <Copy className="h-3.5 w-3.5" /> Copiar protocolo
              </Button>
              <Button size="sm" variant="secondary" onClick={compartilhar} className="gap-1.5 bg-white/10 text-white hover:bg-white/20 border border-white/20">
                <Share2 className="h-3.5 w-3.5" /> Compartilhar verificação
              </Button>
              <div className="ml-auto font-mono text-xs text-emerald-50/80 self-center">
                {doc.protocolo}
              </div>
            </div>
          </div>
        )}

        {/* Aviso de uso anormal */}
        {doc && alertaFraude && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Uso intenso detectado</div>
              Este documento foi consultado {consultas24h} vezes nas últimas 24h. Volume alto pode indicar
              tentativa de uso duplicado — confirme com o paciente antes de dispensar.
            </div>
          </div>
        )}

        {/* Detalhes do documento */}
        {doc && (
          <div className="mt-4 rounded-2xl border bg-card shadow-sm">
            <div className="border-b px-6 py-3 text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Dados do documento
            </div>
            <div className="space-y-4 p-6">
              <Row label="Tipo" value={TIPO_LABEL[doc.tipo] ?? doc.tipo} />
              <Row label="Paciente" value={doc.paciente_nome_iniciais} />
              {doc.paciente_cpf_mask && <Row label="CPF" value={doc.paciente_cpf_mask} mono />}
              <Row label="Profissional" value={doc.profissional_nome} icon={Stethoscope} />
              {doc.profissional_conselho && <Row label="Registro" value={doc.profissional_conselho} mono />}
              {doc.unidade_nome && <Row label="Unidade" value={doc.unidade_nome} />}
              {doc.unidade_cnes && <Row label="CNES" value={doc.unidade_cnes} mono />}
              <Row label="Emitido em" value={new Date(doc.emitido_em).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })} />
              {doc.assinatura && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" /> Assinatura digital SpokenMED
                  </div>
                  <div className="mt-1 break-all font-mono text-[11px] text-foreground">{doc.assinatura}</div>
                  {doc.assinado_em && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Assinado em {new Date(doc.assinado_em).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Hash HMAC-SHA256 vinculado ao profissional emissor — equivalente a assinatura eletrônica avançada (MP 2.200-2/01, art. 10 §2º).
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline de consultas */}
        {doc && doc.eventos && doc.eventos.length > 0 && (
          <div className="mt-4 rounded-2xl border bg-card shadow-sm">
            <div className="border-b px-6 py-3 text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Histórico de verificações
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                últimas {doc.eventos.length}
              </span>
            </div>
            <ol className="divide-y">
              {doc.eventos.map((ev, i) => (
                <li key={i} className="flex items-center gap-3 px-6 py-3 text-sm">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary shrink-0">
                    <Eye className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      Consulta {ev.user_agent_resumo ? `via ${ev.user_agent_resumo}` : "anônima"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(ev.consultado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      {ev.ip_mask && <> · origem <span className="font-mono">#{ev.ip_mask}</span></>}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{tempoRelativo(ev.consultado_em)}</span>
                </li>
              ))}
            </ol>
            <div className="border-t bg-muted/30 px-6 py-2 text-[11px] text-muted-foreground">
              IPs exibidos em hash anônimo — não é possível identificar o consultante.
            </div>
          </div>
        )}

        {notFound && (
          <div className="mt-6 overflow-hidden rounded-3xl border-2 border-rose-400 bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-xl animate-in fade-in slide-in-from-bottom-3">
            <div className="px-6 py-8 sm:px-10 sm:py-10 flex items-start gap-4">
              <div className="grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur ring-1 ring-white/30">
                <ShieldAlert className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-rose-100/90 font-semibold">Atenção</div>
                <div className="mt-1 text-2xl sm:text-4xl font-extrabold leading-tight">DOCUMENTO NÃO ENCONTRADO</div>
                <div className="mt-2 text-sm sm:text-base text-rose-50/95">
                  Nenhum documento com este protocolo está registrado. Verifique se digitou corretamente
                  — códigos válidos costumam ter o formato <span className="font-mono">XXXX-XXXXXX-XXXX</span>.
                  Se o paciente apresentou esse código em papel, suspeite de falsificação.
                </div>
              </div>
            </div>
          </div>
        )}

        {erro && (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            {erro}
          </div>
        )}

        <div className="mt-8 rounded-xl border bg-card/60 p-4 text-xs text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
            <FileText className="h-3.5 w-3.5" /> Sobre a verificação
          </div>
          Cada documento emitido recebe um protocolo único exibido em QR code no rodapé.
          A consulta confirma que o documento foi realmente emitido por um profissional
          habilitado através do SpokenMED, sem expor dados sensíveis do paciente.
          Cada verificação é registrada em log auditável (LGPD art. 37).
        </div>
      </main>
    </div>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/15 backdrop-blur px-3 py-2 ring-1 ring-white/20">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/80 font-medium">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-0.5 text-sm sm:text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Row({ label, value, mono, icon: Icon }: { label: string; value: string; mono?: boolean; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}>
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
        {value}
      </span>
    </div>
  );
}
