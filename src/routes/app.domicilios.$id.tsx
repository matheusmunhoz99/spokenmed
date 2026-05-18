import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowLeft, Plus } from "lucide-react";
import { LoadingState } from "@/components/loading-state";

export const Route = createFileRoute("/app/domicilios/$id")({ component: DomicilioDetail });

function DomicilioDetail() {
  const { id } = useParams({ from: "/app/domicilios/$id" });
  const { data, isLoading } = useQuery({
    queryKey: ["domicilio", id],
    queryFn: async () => {
      const { data: dom } = await supabase.from("domicilios").select("*").eq("id", id).maybeSingle();
      const { data: fams } = await supabase.from("familias").select("*, familia_membros(*, pacientes(id, nome, cpf))").eq("domicilio_id", id);
      return { dom, fams: fams ?? [] };
    },
  });

  if (isLoading) return <LoadingState />;
  if (!data?.dom) return <div className="p-6">Domicílio não encontrado.</div>;
  const d = data.dom;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <Link to="/app/domicilios"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Button></Link>
        <Link to="/app/visitas/nova"><Button size="sm"><Plus className="mr-1 h-4 w-4" /> Nova visita</Button></Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{[d.logradouro, d.numero].filter(Boolean).join(", ")}</CardTitle>
          <p className="text-sm text-muted-foreground">{[d.bairro, d.cidade, d.uf].filter(Boolean).join(" · ")}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm">
          <Info label="Microárea" value={d.microarea} />
          <Info label="Tipo imóvel" value={d.tipo_imovel} />
          <Info label="Domicílio" value={d.tipo_domicilio} />
          <Info label="Situação" value={d.situacao_moradia} />
          <Info label="Moradores" value={d.num_moradores} />
          <Info label="Cômodos" value={d.num_comodos} />
          <Info label="Água" value={d.abastecimento_agua} />
          <Info label="Esgoto" value={d.esgoto} />
          <Info label="Lixo" value={d.destino_lixo} />
          <Info label="Animais" value={(d.animais as string[]).join(", ") || "—"} />
          <div className="col-span-2">
            <a className="inline-flex items-center gap-1 underline text-xs text-muted-foreground" target="_blank" rel="noreferrer"
               href={`https://www.google.com/maps?q=${d.latitude},${d.longitude}`}>
              <MapPin className="h-3 w-3" /> Ver no mapa (±{Math.round(Number(d.gps_accuracy ?? 0))} m)
            </a>
          </div>
        </CardContent>
      </Card>

      {data.fams.map((f: any) => (
        <Card key={f.id}>
          <CardHeader>
            <CardTitle className="text-base">Família {f.prontuario_familiar ? `· ${f.prontuario_familiar}` : ""}</CardTitle>
            <div className="flex flex-wrap gap-1 text-xs">
              {f.bolsa_familia && <Badge variant="secondary">Bolsa Família</Badge>}
              {f.situacao_rua && <Badge variant="secondary">Situação de rua</Badge>}
              {f.renda_familiar && <Badge variant="outline">Renda R$ {Number(f.renda_familiar).toFixed(2)}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {f.familia_membros.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <div>
                  <span className="font-medium">{m.pacientes?.nome}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{m.pacientes?.cpf ?? ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  {m.is_responsavel && <Badge>Referência</Badge>}
                  <Badge variant="outline" className="capitalize">{m.parentesco}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="font-medium capitalize">{value ?? "—"}</div>
    </div>
  );
}
