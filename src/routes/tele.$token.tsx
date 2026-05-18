import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { pacienteEntrar } from "@/lib/tele.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Video, Calendar, User, AlertCircle, Check } from "lucide-react";
import { DailyEmbed } from "@/components/tele/DailyEmbed";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import logo from "@/assets/spokenmed-logo.png";

export const Route = createFileRoute("/tele/$token")({
  head: () => ({
    meta: [
      { title: "Teleconsulta — SpokenMED" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TelePage,
});

type Sessao = {
  sala_id: string;
  room_url: string;
  meeting_token: string;
  paciente_nome: string;
  profissional_nome: string;
  data: string;
  hora_inicio: string;
  gravar: boolean;
  consentimento_gravacao: boolean;
};

function TelePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const entrar = useServerFn(pacienteEntrar);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emChamada, setEmChamada] = useState(false);
  const [consentimentoOk, setConsentimentoOk] = useState(false);

  const handleEntrar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await entrar({ data: { token } });
      setSessao(r as Sessao);
      setConsentimentoOk(r.consentimento_gravacao);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível entrar na sala.");
    } finally {
      setLoading(false);
    }
  };

  const aceitarGravacao = async () => {
    const { data, error } = await supabase.rpc("tele_aceitar_gravacao" as any, { p_token: token });
    if (!error && data) setConsentimentoOk(true);
  };

  const iniciarChamada = () => {
    if (sessao?.gravar && !consentimentoOk) return;
    setEmChamada(true);
  };

  useEffect(() => {
    // entra automaticamente na sala de espera
    handleEntrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (emChamada && sessao) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background p-2 sm:p-4">
        <div className="flex-1 min-h-0">
          <DailyEmbed
            url={sessao.room_url}
            token={sessao.meeting_token}
            onLeft={() => navigate({ to: "/tele/$token/avaliar", params: { token } })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/40 px-4 py-8">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <img src={logo} alt="SpokenMED" className="mb-6 h-12 w-auto" />
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Sua teleconsulta</CardTitle>
            </div>
            <CardDescription>Tudo pronto para o atendimento por vídeo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {erro && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}
            {sessao && (
              <>
                <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{sessao.paciente_nome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{sessao.profissional_nome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(new Date(sessao.data + "T00:00:00"), "PPP", { locale: ptBR })} às {sessao.hora_inicio.slice(0,5)}
                    </span>
                  </div>
                </div>

                {sessao.gravar && (
                  <div className={`rounded-md border p-3 text-sm ${consentimentoOk ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"}`}>
                    {consentimentoOk ? (
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                        <Check className="h-4 w-4" /> Gravação autorizada.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p>Este atendimento poderá ser gravado para fins clínicos. Para iniciar, autorize a gravação.</p>
                        <Button size="sm" variant="outline" className="w-full" onClick={aceitarGravacao}>
                          Autorizo a gravação
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  size="lg"
                  className="h-12 w-full"
                  disabled={sessao.gravar && !consentimentoOk}
                  onClick={iniciarChamada}
                >
                  <Video className="mr-2 h-5 w-5" /> Entrar na chamada
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Permita acesso à câmera e ao microfone quando o navegador pedir.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
