import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { z } from "zod";
import { Camera, CheckCircle2, Copy, FileText, Search, ShieldAlert, ShieldCheck, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/spokenmed-logo.png";

const QrScannerDialog = lazy(() => import("@/components/verificar/qr-scanner-dialog"));

// Extrai o protocolo de uma string que pode ser uma URL com ?p= ou o próprio código
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
  // Se vier "?p=XXX" ou apenas o código
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
}

const TIPO_LABEL: Record<string, string> = {
  receita: "Receita Médica",
  atestado: "Atestado Médico",
  sadt: "Guia SADT (Exames)",
  lme: "LME — Alto Custo",
  comprovante: "Comprovante de Agendamento",
};

const TIPO_ICON: Record<string, string> = {
  receita: "💊",
  atestado: "📋",
  sadt: "🧪",
  lme: "💉",
  comprovante: "📅",
};

function VerificarPage() {
  const navigate = useNavigate({ from: "/verificar" });
  const search = Route.useSearch();
  const [codigo, setCodigo] = useState(search.p ?? "");
  const [loading, setLoading] = useState(false);
  const [doc, setDoc] = useState<Documento | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const consultar = async (proto: string) => {
    const p = proto.trim().toUpperCase();
    if (!p) return;
    setLoading(true);
    setDoc(null);
    setNotFound(false);
    setErro(null);
    try {
      const { data, error } = await supabase.rpc("verificar_documento", { p_protocolo: p });
      if (error) throw error;
      if (!data || data.length === 0) setNotFound(true);
      else setDoc(data[0] as unknown as Documento);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao consultar.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-consulta se vier ?p= na URL
  useEffect(() => {
    if (search.p && search.p.trim()) {
      setCodigo(search.p);
      consultar(search.p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ search: { p: codigo.trim().toUpperCase() }, replace: true });
    consultar(codigo);
  };

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

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Verificação de documento
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Confirme a autenticidade</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe o código do protocolo impresso no rodapé do documento (ou aponte a câmera para o QR code).
          </p>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="proto" className="sr-only">Protocolo</Label>
              <Input
                id="proto"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="Ex.: RECT-A8K2QR-X3LM"
                className="font-mono uppercase tracking-wide"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={loading || !codigo.trim()} className="gap-2">
              <Search className="h-4 w-4" />
              {loading ? "Consultando…" : "Verificar"}
            </Button>
          </form>
        </div>

        {/* Resultado */}
        {doc && (
          <div className="mt-6 overflow-hidden rounded-2xl border-2 border-emerald-300 bg-card shadow-md animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 border-b border-emerald-200 bg-emerald-50 px-6 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/30">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Documento autêntico</div>
                <div className="text-sm text-foreground">Emitido pelo SpokenMED e registrado no sistema.</div>
              </div>
              <div className="text-3xl" aria-hidden>{TIPO_ICON[doc.tipo] ?? "📄"}</div>
            </div>
            <div className="space-y-4 p-6">
              <Row label="Tipo" value={TIPO_LABEL[doc.tipo] ?? doc.tipo} />
              <Row label="Protocolo" value={doc.protocolo} mono />
              <Row label="Paciente" value={doc.paciente_nome_iniciais} />
              {doc.paciente_cpf_mask && <Row label="CPF" value={doc.paciente_cpf_mask} mono />}
              <Row label="Profissional" value={doc.profissional_nome} icon={Stethoscope} />
              {doc.profissional_conselho && <Row label="Registro" value={doc.profissional_conselho} mono />}
              {doc.unidade_nome && <Row label="Unidade" value={doc.unidade_nome} />}
              {doc.unidade_cnes && <Row label="CNES" value={doc.unidade_cnes} mono />}
              <Row label="Emitido em" value={new Date(doc.emitido_em).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })} />
            </div>
            <div className="border-t bg-muted/30 px-6 py-3 text-[11px] text-muted-foreground">
              Por segurança, exibimos apenas dados essenciais para verificação. Dados sensíveis do paciente permanecem protegidos.
            </div>
          </div>
        )}

        {notFound && (
          <div className="mt-6 rounded-2xl border-2 border-rose-300 bg-rose-50 p-6 dark:border-rose-900/40 dark:bg-rose-950/20">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-rose-600 text-white">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-rose-700 dark:text-rose-300">Documento não encontrado</div>
                <div className="text-sm text-muted-foreground">
                  Verifique se o código foi digitado corretamente. Códigos válidos têm o formato <span className="font-mono">XXXX-XXXXXX-XXXX</span>.
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
        </div>
      </main>
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
