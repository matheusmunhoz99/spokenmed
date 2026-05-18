import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Check, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/spokenmed-logo.png";

export const Route = createFileRoute("/tele/$token/avaliar")({
  head: () => ({ meta: [{ title: "Avaliar Teleconsulta — SpokenMED" }, { name: "robots", content: "noindex" }] }),
  component: AvaliarPage,
});

function AvaliarPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [nota, setNota] = useState(0);
  const [nps, setNps] = useState<number | null>(null);
  const [audioOk, setAudioOk] = useState(true);
  const [videoOk, setVideoOk] = useState(true);
  const [coment, setComent] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  const enviar = async () => {
    if (!nota) return toast.error("Dê uma nota de 1 a 5 estrelas.");
    setEnviando(true);
    const { error, data } = await supabase.rpc("tele_avaliar" as any, {
      p_token: token, p_nota: nota, p_nps: nps, p_comentario: coment || null,
      p_audio_ok: audioOk, p_video_ok: videoOk,
    });
    setEnviando(false);
    if (error || !data) return toast.error(error?.message || "Não foi possível enviar a avaliação.");
    setOk(true);
  };

  if (ok) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/40 px-4 py-8">
        <div className="mx-auto flex max-w-md flex-col items-center">
          <img src={logo} alt="SpokenMED" className="mb-6 h-12 w-auto" />
          <Card className="w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
              </div>
              <CardTitle>Obrigado!</CardTitle>
              <CardDescription>Sua avaliação foi registrada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Acesse seus atestados, receitas e o resumo do médico no Painel do Cidadão.
              </p>
              <Button asChild className="h-11 w-full">
                <Link to="/cidadao"><FileText className="mr-2 h-4 w-4" /> Acessar meus documentos</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/40 px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex justify-center"><img src={logo} alt="SpokenMED" className="h-12 w-auto" /></div>
        <Card>
          <CardHeader>
            <CardTitle>Como foi seu atendimento?</CardTitle>
            <CardDescription>Sua opinião ajuda a melhorar nosso serviço.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Avaliação geral</Label>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map((n) => (
                  <button key={n} type="button" onClick={() => setNota(n)} className="p-1">
                    <Star className={`h-9 w-9 ${n <= nota ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Você recomendaria para um amigo? (0–10)</Label>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, i) => i).map((v) => (
                  <button key={v} type="button" onClick={() => setNps(v)}
                    className={`h-9 rounded-md border text-sm transition ${nps === v ? "border-primary bg-primary text-primary-foreground" : "border-muted hover:bg-muted"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <input type="checkbox" checked={audioOk} onChange={(e) => setAudioOk(e.target.checked)} />
                Áudio estava bom
              </label>
              <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <input type="checkbox" checked={videoOk} onChange={(e) => setVideoOk(e.target.checked)} />
                Vídeo estava bom
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coment">Comentário (opcional)</Label>
              <Textarea id="coment" value={coment} onChange={(e) => setComent(e.target.value)} rows={4} maxLength={1000} />
            </div>

            <Button className="h-11 w-full" onClick={enviar} disabled={enviando}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar avaliação
            </Button>
            <button type="button" onClick={() => navigate({ to: "/cidadao" })} className="block w-full text-center text-sm text-muted-foreground underline">
              Pular e ir ao painel
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
