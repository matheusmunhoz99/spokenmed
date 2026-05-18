import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
import { SignaturePad } from "@/components/signature-pad";
import { GeolocationCapture, type GeoCoord } from "@/components/geolocation-capture";
import { MOTIVOS_VISITA, ACOMPANHAMENTOS, CONTROLE_AMBIENTAL, TURNOS, DESFECHOS } from "@/lib/visitas-constants";
import { format } from "date-fns";

function Guard() {
  const { can } = useAuth();
  if (!can("visitas", "manage")) return <SemAcesso />;
  return <NovaVisitaPage />;
}

export const Route = createFileRoute("/app/visitas/nova")({ component: Guard });

function NovaVisitaPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
  const [paciente, setPaciente] = useState<any>(null);
  const [dataVisita, setDataVisita] = useState(format(new Date(), "yyyy-MM-dd"));
  const [turno, setTurno] = useState("manha");
  const [desfecho, setDesfecho] = useState("realizada");
  const [motivos, setMotivos] = useState<string[]>([]);
  const [acomps, setAcomps] = useState<string[]>([]);
  const [ctrlAmb, setCtrlAmb] = useState<string[]>([]);
  const [antiVet, setAntiVet] = useState(false);
  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [pasis, setPasis] = useState("");
  const [padia, setPadia] = useState("");
  const [obs, setObs] = useState("");
  const [endereco, setEndereco] = useState("");
  const [geo, setGeo] = useState<GeoCoord | null>(null);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [recusou, setRecusou] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: pacientes } = useQuery({
    queryKey: ["pac-busca", busca],
    enabled: busca.trim().length >= 3,
    queryFn: async () => {
      const t = busca.replace(/\D/g, "");
      let q = supabase.from("pacientes").select("id, nome, cpf, data_nascimento, logradouro, numero, bairro").eq("ativo", true).limit(15);
      q = t.length >= 3 ? q.or(`nome.ilike.%${busca}%,cpf.ilike.%${t}%`) : q.ilike("nome", `%${busca}%`);
      return (await q).data ?? [];
    },
  });

  const enderecoPac = useMemo(() => {
    if (!paciente) return "";
    return [paciente.logradouro, paciente.numero, paciente.bairro].filter(Boolean).join(", ");
  }, [paciente]);

  const toggle = (arr: string[], setArr: (v: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const handleFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setFotos((prev) => [...prev, ...files].slice(0, 3));
  };

  const salvar = async () => {
    if (!paciente) { toast.error("Selecione o paciente."); return; }
    if (!geo) { toast.error("GPS é obrigatório para salvar a visita."); return; }
    if (desfecho === "realizada" && !assinatura && !recusou) {
      toast.error("Colete a assinatura do paciente ou marque 'recusou assinar'.");
      return;
    }
    if (recusou && !motivoRecusa.trim()) {
      toast.error("Informe o motivo da recusa de assinatura.");
      return;
    }
    if (motivos.length === 0) { toast.error("Selecione ao menos um motivo da visita."); return; }

    setSaving(true);
    try {
      // upload fotos
      const fotosMeta: any[] = [];
      for (const f of fotos) {
        const path = `${user!.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("visitas-fotos").upload(path, f, { upsert: false });
        if (error) throw new Error("Erro ao enviar foto: " + error.message);
        fotosMeta.push({ path, name: f.name, size: f.size });
      }

      const payload: any = {
        paciente_id: paciente.id,
        acs_user_id: user!.id,
        unidade_id: null,
        data_visita: dataVisita,
        turno,
        desfecho,
        motivos,
        acompanhamentos: acomps,
        controle_ambiental: ctrlAmb,
        anti_vetorial: antiVet,
        peso: peso ? Number(peso.replace(",", ".")) : null,
        altura: altura ? Number(altura.replace(",", ".")) : null,
        pa_sistolica: pasis ? parseInt(pasis, 10) : null,
        pa_diastolica: padia ? parseInt(padia, 10) : null,
        latitude: geo.latitude,
        longitude: geo.longitude,
        gps_accuracy: geo.accuracy,
        gps_capturado_em: geo.captured_at,
        endereco_visitado: endereco || enderecoPac || null,
        observacoes: obs || null,
        assinatura_paciente: recusou ? null : assinatura,
        assinatura_paciente_em: assinatura && !recusou ? new Date().toISOString() : null,
        assinatura_recusada: recusou,
        assinatura_recusa_motivo: recusou ? motivoRecusa : null,
        fotos: fotosMeta,
      };

      const { error } = await supabase.from("visitas_domiciliares").insert(payload);
      if (error) throw new Error(error.message);
      toast.success("Visita registrada com sucesso");
      nav({ to: "/app/visitas" });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-20">
      <h1 className="text-2xl font-bold">Nova Visita Domiciliar</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Paciente</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {paciente ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{paciente.nome}</div>
                <div className="text-xs text-muted-foreground">{paciente.cpf} · {enderecoPac}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPaciente(null)}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <>
              <Input placeholder="Buscar por nome ou CPF (mín. 3 caracteres)" value={busca} onChange={(e) => setBusca(e.target.value)} />
              {pacientes && pacientes.length > 0 && (
                <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
                  {pacientes.map((p: any) => (
                    <button key={p.id} type="button"
                      onClick={() => { setPaciente(p); setBusca(""); setEndereco([p.logradouro, p.numero, p.bairro].filter(Boolean).join(", ")); }}
                      className="block w-full text-left px-3 py-2 hover:bg-muted text-sm">
                      <div className="font-medium">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.cpf}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. Visita</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div><Label>Data</Label><Input type="date" value={dataVisita} onChange={(e) => setDataVisita(e.target.value)} /></div>
          <div><Label>Turno</Label>
            <Select value={turno} onValueChange={setTurno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TURNOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Endereço visitado</Label><Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Endereço onde a visita foi realizada" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">3. Motivo da visita</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MOTIVOS_VISITA.map((m) => (
            <label key={m.value} className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={motivos.includes(m.value)} onCheckedChange={() => toggle(motivos, setMotivos, m.value)} />
              <span>{m.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">4. Acompanhamento</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ACOMPANHAMENTOS.map((m) => (
            <label key={m.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={acomps.includes(m.value)} onCheckedChange={() => toggle(acomps, setAcomps, m.value)} />
              <span>{m.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">5. Controle ambiental / vetorial</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={antiVet} onCheckedChange={(v) => setAntiVet(!!v)} />
            <span>Visita compartilhada com agente de endemias</span>
          </label>
          {CONTROLE_AMBIENTAL.map((m) => (
            <label key={m.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={ctrlAmb.includes(m.value)} onCheckedChange={() => toggle(ctrlAmb, setCtrlAmb, m.value)} />
              <span>{m.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">6. Antropometria / PA (opcional)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><Label className="text-xs">Peso (kg)</Label><Input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></div>
          <div><Label className="text-xs">Altura (m)</Label><Input inputMode="decimal" value={altura} onChange={(e) => setAltura(e.target.value)} /></div>
          <div><Label className="text-xs">PA sistólica</Label><Input inputMode="numeric" value={pasis} onChange={(e) => setPasis(e.target.value)} /></div>
          <div><Label className="text-xs">PA diastólica</Label><Input inputMode="numeric" value={padia} onChange={(e) => setPadia(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">7. Desfecho e observações</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Desfecho</Label>
            <Select value={desfecho} onValueChange={setDesfecho}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DESFECHOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Observações</Label><Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">8. Localização GPS (obrigatório)</CardTitle></CardHeader>
        <CardContent><GeolocationCapture value={geo} onChange={setGeo} required /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">9. Fotos (até 3)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input type="file" accept="image/*" multiple capture="environment" onChange={handleFotos} disabled={fotos.length >= 3} />
          {fotos.length > 0 && (
            <ul className="text-xs space-y-1">
              {fotos.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded border px-2 py-1">
                  <span className="truncate"><Upload className="inline h-3 w-3 mr-1" />{f.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => setFotos(fotos.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">10. Assinatura do paciente</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!recusou && <SignaturePad value={assinatura} onChange={setAssinatura} />}
          <label className="flex items-center gap-2 text-sm pt-2 border-t">
            <Checkbox checked={recusou} onCheckedChange={(v) => { setRecusou(!!v); if (v) setAssinatura(null); }} />
            <span>Paciente recusou / impossibilitado de assinar</span>
          </label>
          {recusou && <Input placeholder="Motivo da recusa / impossibilidade" value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} />}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-3 -mx-4 flex gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/app/visitas" })} className="flex-1">Cancelar</Button>
        <Button onClick={salvar} disabled={saving} className="flex-1"><Save className="mr-1 h-4 w-4" />{saving ? "Salvando..." : "Salvar visita"}</Button>
      </div>
    </div>
  );
}
