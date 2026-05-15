import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Calendar, MapPin, Stethoscope, Phone, Printer, ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatCPF, onlyDigits } from "@/lib/format";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import logo from "@/assets/spokenmed-logo.png";

export const Route = createFileRoute("/cidadao")({
  head: () => ({
    meta: [
      { title: "Painel do Cidadão — SpokenMED" },
      { name: "description", content: "Consulte seu agendamento de saúde com código + CPF." },
    ],
  }),
  component: CidadaoPage,
});

type Resultado = {
  codigo: string;
  data: string;
  hora_inicio: string;
  status: string;
  is_encaixe: boolean;
  paciente_nome: string;
  profissional_nome: string | null;
  profissional_conselho: string | null;
  especialidade_nome: string | null;
  unidade_nome: string | null;
  unidade_endereco: string | null;
  unidade_telefone: string | null;
  unidade_cnes: string | null;
  procedimento_codigo: string | null;
  procedimento_nome: string | null;
  profissional_cbo: string | null;
  observacoes: string | null;
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  agendado: { label: "Agendado", variant: "default" },
  confirmado: { label: "Confirmado", variant: "default" },
  atendido: { label: "Atendido", variant: "secondary" },
  faltou: { label: "Falta registrada", variant: "destructive" },
  cancelado: { label: "Cancelado", variant: "destructive" },
};

function CidadaoPage() {
  const [codigo, setCodigo] = useState("");
  const [cpf, setCpf] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const handleConsultar = async (e: React.FormEvent) => {
    e.preventDefault();
    const cpfDigits = onlyDigits(cpf);
    const codClean = codigo.trim().toUpperCase();
    if (cpfDigits.length !== 11) return toast.error("CPF inválido.");
    if (codClean.length !== 8) return toast.error("Código deve ter 8 caracteres.");

    setSubmitting(true);
    setNaoEncontrado(false);
    setResultado(null);
    try {
      const { data, error } = await supabase.rpc("cidadao_consultar", {
        p_codigo: codClean,
        p_cpf: cpfDigits,
      });
      if (error) throw error;
      const row = (data as Resultado[] | null)?.[0];
      if (!row) {
        setNaoEncontrado(true);
      } else {
        setResultado(row);
      }
    } catch (e: any) {
      const code = e?.code ?? "";
      const msg = String(e?.message ?? "");
      if (code === "P0010" || msg.includes("rate_limit_cpf")) {
        toast.error("Muitas tentativas para este CPF. Tente novamente em 1 hora.");
      } else if (code === "P0011" || msg.includes("rate_limit_ip")) {
        toast.error("Muitas tentativas a partir do seu acesso. Tente novamente em 1 hora.");
      } else {
        toast.error("Erro na consulta. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleNova = () => {
    setResultado(null);
    setNaoEncontrado(false);
    setCodigo("");
    setCpf("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/40">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="SpokenMED" className="h-10 w-10 object-contain" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">Painel do Cidadão</div>
              <div className="text-[11px] text-muted-foreground">Secretaria Municipal de Saúde</div>
            </div>
          </div>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 inline h-3 w-3" /> Início
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 print:py-0">
        {!resultado ? (
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="text-xl">Consultar agendamento</CardTitle>
              <CardDescription>
                Informe o <strong>código de 8 caracteres</strong> do seu agendamento (entregue na unidade ou no SMS) e seu <strong>CPF</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConsultar} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="codigo">Código do agendamento</Label>
                  <Input
                    id="codigo"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                    placeholder="Ex.: A3F9K2P7"
                    maxLength={8}
                    autoComplete="off"
                    inputMode="text"
                    className="font-mono tracking-widest text-center text-lg"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF do paciente</Label>
                  <Input
                    id="cpf"
                    value={formatCPF(cpf)}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Consultar
                </Button>
                {naoEncontrado && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      Nenhum agendamento encontrado com esse código e CPF. Verifique os dados e tente novamente, ou procure a unidade de saúde.
                    </div>
                  </div>
                )}
                <p className="pt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                  Esta consulta é registrada para fins de auditoria (LGPD). Não compartilhe seu código de agendamento.
                </p>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Resultado data={resultado} onNova={handleNova} />
        )}
      </main>
    </div>
  );
}

function Resultado({ data, onNova }: { data: Resultado; onNova: () => void }) {
  const status = STATUS_LABEL[data.status] ?? { label: data.status, variant: "outline" as const };
  const dataFmt = format(new Date(`${data.data}T00:00:00`), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const horaFmt = data.hora_inicio.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={onNova}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Nova consulta
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir comprovante
        </Button>
      </div>

      <Card className="print:border-none print:shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
          <div>
            <CardTitle className="text-xl">Comprovante de Agendamento</CardTitle>
            <CardDescription>Apresente este comprovante na unidade.</CardDescription>
          </div>
          <Badge variant={status.variant} className="text-sm">{status.label}</Badge>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="rounded-lg border bg-muted/40 p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Código</div>
            <div className="mt-1 font-mono text-2xl font-bold tracking-[0.3em]">{data.codigo}</div>
          </div>

          <Section icon={<Calendar className="h-4 w-4" />} title="Data e horário">
            <div className="text-base font-medium capitalize">{dataFmt}</div>
            <div className="text-sm text-muted-foreground">às {horaFmt}{data.is_encaixe && " (encaixe)"}</div>
          </Section>

          <Section icon={<Stethoscope className="h-4 w-4" />} title="Profissional">
            <div className="text-base font-medium">{data.profissional_nome ?? "—"}</div>
            <div className="text-sm text-muted-foreground">
              {data.especialidade_nome ?? "—"}
              {data.profissional_conselho ? ` · ${data.profissional_conselho}` : ""}
            </div>
          </Section>

          <Section icon={<MapPin className="h-4 w-4" />} title="Unidade">
            <div className="text-base font-medium">{data.unidade_nome ?? "—"}</div>
            {data.unidade_endereco && <div className="text-sm text-muted-foreground">{data.unidade_endereco}</div>}
            {data.unidade_telefone && (
              <div className="mt-1 text-sm text-muted-foreground">
                <Phone className="mr-1 inline h-3 w-3" /> {data.unidade_telefone}
              </div>
            )}
            {data.unidade_cnes && (
              <div className="mt-1 text-xs text-muted-foreground font-mono">CNES {data.unidade_cnes}</div>
            )}
          </Section>

          {(data.procedimento_codigo || data.procedimento_nome) && (
            <Section icon={<></>} title="Procedimento (SIGTAP)">
              <div className="text-sm">
                {data.procedimento_codigo && <span className="font-mono mr-2">{data.procedimento_codigo}</span>}
                {data.procedimento_nome}
              </div>
            </Section>
          )}

          <Section icon={<></>} title="Paciente">
            <div className="text-base font-medium">{data.paciente_nome}</div>
          </Section>

          {data.observacoes && (
            <Section icon={<></>} title="Observações">
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">{data.observacoes}</div>
            </Section>
          )}

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-100 print:hidden">
            <strong>Importante:</strong> chegue com 15 minutos de antecedência e traga documento com foto e Cartão SUS.
            Em caso de imprevisto, ligue para a unidade para reagendar.
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-[11px] text-muted-foreground print:hidden">
        Comprovante gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")} · SpokenMED
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </div>
      <div className="pl-0.5">{children}</div>
    </div>
  );
}
