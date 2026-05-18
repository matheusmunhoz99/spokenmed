import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Save, Upload, X, Home, Users, User, ChevronLeft, CheckCircle2, Calendar, MapPin, ClipboardList, FileSignature, Camera } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
import { SignatureDialog, type SignatureResult } from "@/components/signature-dialog";
import { GeolocationCapture, type GeoCoord } from "@/components/geolocation-capture";
import { MOTIVOS_VISITA, ACOMPANHAMENTOS, CONTROLE_AMBIENTAL, TURNOS, DESFECHOS } from "@/lib/visitas-constants";
import { format } from "date-fns";

function Guard() {
  const { can } = useAuth();
  if (!can("visitas", "manage")) return <SemAcesso />;
  return <NovaVisitaPage />;
}

export const Route = createFileRoute("/app/visitas/nova")({ component: Guard });

type Membro = {
  paciente_id: string;
  parentesco: string | null;
  is_responsavel: boolean;
  pacientes: { id: string; nome: string; cpf: string | null; data_nascimento: string | null } | null;
};

function NovaVisitaPage() {
  const nav = useNavigate();
  const { user } = useAuth();

  // Seleção em cascata
  const [domicilio, setDomicilio] = useState<any>(null);
  const [familia, setFamilia] = useState<any>(null);
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [buscaDom, setBuscaDom] = useState("");

  const [dataVisita, setDataVisita] = useState(format(new Date(), "yyyy-MM-dd"));
  const [turno, setTurno] = useState("manha");
  const [desfecho, setDesfecho] = useState("visita_realizada");
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
  const [askReplicar, setAskReplicar] = useState(false);
  const [askAssinatura, setAskAssinatura] = useState(false);
  const [resumo, setResumo] = useState<null | {
    pacientes: { id: string; nome: string }[];
    replicado: boolean;
    fotosCount: number;
  }>(null);

  // 1) Domicílios do ACS
  const { data: domicilios } = useQuery({
    queryKey: ["acs-domicilios", user?.id, buscaDom],
    enabled: !!user && !domicilio,
    queryFn: async () => {
      let q = supabase
        .from("domicilios")
        .select("id, logradouro, numero, bairro, cidade, uf, microarea, cep, latitude, longitude, familias(id)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (buscaDom.trim().length >= 2) {
        q = q.or(`logradouro.ilike.%${buscaDom}%,bairro.ilike.%${buscaDom}%,microarea.ilike.%${buscaDom}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2) Famílias do domicílio
  const { data: familias } = useQuery({
    queryKey: ["dom-familias", domicilio?.id],
    enabled: !!domicilio && !familia,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("familias")
        .select("id, prontuario_familiar, responsavel_paciente_id, familia_membros(paciente_id, pacientes(nome))")
        .eq("domicilio_id", domicilio.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3) Membros da família
  const { data: membros } = useQuery({
    queryKey: ["fam-membros", familia?.id],
    enabled: !!familia,
    queryFn: async (): Promise<Membro[]> => {
      const { data, error } = await supabase
        .from("familia_membros")
        .select("paciente_id, parentesco, is_responsavel, pacientes(id, nome, cpf, data_nascimento)")
        .eq("familia_id", familia.id);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const pacienteSelecionado = useMemo(
    () => membros?.find((m) => m.paciente_id === pacienteId)?.pacientes ?? null,
    [membros, pacienteId],
  );

  const enderecoDom = useMemo(() => {
    if (!domicilio) return "";
    return [domicilio.logradouro, domicilio.numero, domicilio.bairro, domicilio.cidade].filter(Boolean).join(", ");
  }, [domicilio]);

  const toggle = (arr: string[], setArr: (v: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const handleFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setFotos((prev) => [...prev, ...files].slice(0, 3));
  };

  const validar = () => {
    if (!domicilio) { toast.error("Selecione o domicílio."); return false; }
    if (!familia) { toast.error("Selecione a família."); return false; }
    if (!pacienteId) { toast.error("Selecione o membro da família."); return false; }
    if (!geo) { toast.error("GPS é obrigatório para salvar a visita."); return false; }
    if (motivos.length === 0) { toast.error("Selecione ao menos um motivo da visita."); return false; }
    return true;
  };

  const onClickSalvar = () => {
    if (!validar()) return;
    // Se desfecho realizada e ainda não temos assinatura ou recusa, abrir modal
    if (desfecho === "visita_realizada" && !assinatura && !recusou) {
      setAskAssinatura(true);
      return;
    }
    prosseguirSalvar();
  };

  const prosseguirSalvar = () => {
    const totalMembros = membros?.length ?? 0;
    if (totalMembros >= 2) {
      setAskReplicar(true);
    } else {
      void salvar(false);
    }
  };

  const handleAssinaturaConfirmada = (r: SignatureResult) => {
    setAskAssinatura(false);
    if (r.recusou) {
      setRecusou(true);
      setMotivoRecusa(r.motivoRecusa);
      setAssinatura(null);
    } else {
      setRecusou(false);
      setMotivoRecusa("");
      setAssinatura(r.assinatura);
    }
    // dar um tick para o estado atualizar antes de seguir
    setTimeout(() => prosseguirSalvar(), 0);
  };

  const salvar = async (replicar: boolean) => {
    setAskReplicar(false);
    setSaving(true);
    try {
      // upload fotos (uma única vez)
      const fotosMeta: any[] = [];
      for (const f of fotos) {
        const path = `${user!.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("visitas-fotos").upload(path, f, { upsert: false });
        if (error) throw new Error("Erro ao enviar foto: " + error.message);
        fotosMeta.push({ path, name: f.name, size: f.size });
      }

      const basePayload: any = {
        acs_user_id: user!.id,
        unidade_id: domicilio.unidade_id ?? null,
        domicilio_id: domicilio.id,
        familia_id: familia.id,
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
        latitude: geo!.latitude,
        longitude: geo!.longitude,
        gps_accuracy: geo!.accuracy,
        gps_capturado_em: geo!.captured_at,
        endereco_visitado: endereco || enderecoDom || null,
        observacoes: obs || null,
        assinatura_paciente: recusou ? null : assinatura,
        assinatura_paciente_em: assinatura && !recusou ? new Date().toISOString() : null,
        assinatura_recusada: recusou,
        assinatura_recusa_motivo: recusou ? motivoRecusa : null,
        fotos: fotosMeta,
      };

      const alvos = replicar
        ? (membros ?? []).map((m) => m.paciente_id)
        : [pacienteId!];

      const rows = alvos.map((pid) => ({ ...basePayload, paciente_id: pid }));
      const { error } = await supabase.from("visitas_domiciliares").insert(rows);
      if (error) throw new Error(error.message);

      const pacientesAlvo = (membros ?? [])
        .filter((m) => alvos.includes(m.paciente_id))
        .map((m) => ({ id: m.paciente_id, nome: m.pacientes?.nome ?? "—" }));

      toast.success(
        rows.length > 1
          ? `Visita registrada para ${rows.length} pacientes da família`
          : "Visita registrada com sucesso",
      );
      setResumo({ pacientes: pacientesAlvo, replicado: replicar, fotosCount: fotosMeta.length });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  // ---------- UI ----------
  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-20">
      <h1 className="text-2xl font-bold">Nova Visita Domiciliar</h1>

      {/* PASSO 1: Domicílio */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Home className="h-4 w-4" /> 1. Domicílio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {domicilio ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium">{enderecoDom || "Domicílio"}</div>
                <div className="text-xs text-muted-foreground">
                  Microárea: {domicilio.microarea ?? "—"} · CEP {domicilio.cep ?? "—"}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setDomicilio(null); setFamilia(null); setPacienteId(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Buscar por logradouro, bairro ou microárea"
                value={buscaDom}
                onChange={(e) => setBuscaDom(e.target.value)}
              />
              <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                {(domicilios ?? []).map((d: any) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => { setDomicilio(d); setEndereco([d.logradouro, d.numero, d.bairro, d.cidade].filter(Boolean).join(", ")); }}
                    className="block w-full text-left px-3 py-2 hover:bg-muted text-sm"
                  >
                    <div className="font-medium">
                      {[d.logradouro, d.numero].filter(Boolean).join(", ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[d.bairro, d.cidade, d.uf].filter(Boolean).join(" · ")} · Microárea {d.microarea ?? "—"} · {d.familias?.length ?? 0} família(s)
                    </div>
                  </button>
                ))}
                {(domicilios ?? []).length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    Nenhum domicílio encontrado.
                  </div>
                )}
              </div>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/app/domicilios/novo">+ Cadastrar novo domicílio</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* PASSO 2: Família */}
      {domicilio && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> 2. Família</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {familia ? (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">Prontuário: {familia.prontuario_familiar ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {familia.familia_membros?.length ?? 0} membro(s)
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setFamilia(null); setPacienteId(null); }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
                  {(familias ?? []).map((f: any) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFamilia(f)}
                      className="block w-full text-left px-3 py-2 hover:bg-muted text-sm"
                    >
                      <div className="font-medium">Prontuário: {f.prontuario_familiar ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.familia_membros?.length ?? 0} membro(s)
                      </div>
                    </button>
                  ))}
                  {(familias ?? []).length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      Nenhuma família cadastrada neste domicílio.
                    </div>
                  )}
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/app/domicilios/$id" params={{ id: domicilio.id }}>
                    Gerenciar famílias deste domicílio
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* PASSO 3: Membro */}
      {familia && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> 3. Paciente (membro da família)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(membros ?? []).length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                Esta família não tem membros cadastrados. Acesse o domicílio para adicionar.
              </div>
            ) : (
              <div className="space-y-1">
                {(membros ?? []).map((m) => (
                  <label
                    key={m.paciente_id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer ${pacienteId === m.paciente_id ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div>
                      <div className="font-medium text-sm">{m.pacientes?.nome ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.parentesco ?? "—"}{m.is_responsavel ? " · Responsável" : ""} · {m.pacientes?.cpf ?? "sem CPF"}
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="membro"
                      checked={pacienteId === m.paciente_id}
                      onChange={() => setPacienteId(m.paciente_id)}
                    />
                  </label>
                ))}
              </div>
            )}
            {pacienteSelecionado && (membros?.length ?? 0) >= 2 && (
              <div className="text-xs text-muted-foreground pt-2">
                Ao salvar, você poderá replicar esta visita para todos os {membros!.length} membros da família.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Demais seções: só aparecem com paciente selecionado */}
      {pacienteId && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">4. Visita</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><Input type="date" value={dataVisita} onChange={(e) => setDataVisita(e.target.value)} /></div>
              <div><Label>Turno</Label>
                <Select value={turno} onValueChange={setTurno}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TURNOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Endereço visitado</Label><Input value={endereco} onChange={(e) => setEndereco(e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">5. Motivo da visita</CardTitle></CardHeader>
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
            <CardHeader><CardTitle className="text-base">6. Acompanhamento</CardTitle></CardHeader>
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
            <CardHeader><CardTitle className="text-base">7. Controle ambiental / vetorial</CardTitle></CardHeader>
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
            <CardHeader><CardTitle className="text-base">8. Antropometria / PA (opcional)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><Label className="text-xs">Peso (kg)</Label><Input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></div>
              <div><Label className="text-xs">Altura (m)</Label><Input inputMode="decimal" value={altura} onChange={(e) => setAltura(e.target.value)} /></div>
              <div><Label className="text-xs">PA sistólica</Label><Input inputMode="numeric" value={pasis} onChange={(e) => setPasis(e.target.value)} /></div>
              <div><Label className="text-xs">PA diastólica</Label><Input inputMode="numeric" value={padia} onChange={(e) => setPadia(e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">9. Desfecho e observações</CardTitle></CardHeader>
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
            <CardHeader><CardTitle className="text-base">10. Localização GPS (obrigatório)</CardTitle></CardHeader>
            <CardContent><GeolocationCapture value={geo} onChange={setGeo} required /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">11. Fotos (até 3)</CardTitle></CardHeader>
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
            <CardHeader><CardTitle className="text-base">12. Assinatura do paciente / responsável</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!recusou && <SignaturePad value={assinatura} onChange={setAssinatura} />}
              <label className="flex items-center gap-2 text-sm pt-2 border-t">
                <Checkbox checked={recusou} onCheckedChange={(v) => { setRecusou(!!v); if (v) setAssinatura(null); }} />
                <span>Paciente recusou / impossibilitado de assinar</span>
              </label>
              {recusou && <Input placeholder="Motivo da recusa / impossibilidade" value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} />}
            </CardContent>
          </Card>
        </>
      )}

      <div
        className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-3 -mx-4 flex gap-2 z-10"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <Button variant="outline" onClick={() => nav({ to: "/app/visitas" })} className="flex-1 h-11">Cancelar</Button>
        <Button onClick={onClickSalvar} disabled={saving || !pacienteId} className="flex-1 h-11">
          <Save className="mr-1 h-4 w-4" />{saving ? "Salvando..." : "Salvar visita"}
        </Button>
      </div>

      <AlertDialog open={askReplicar} onOpenChange={setAskReplicar}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Replicar para a família?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta família tem <strong>{membros?.length ?? 0}</strong> membros. Deseja registrar esta mesma visita
              para todos os membros (cada um com seu próprio registro), ou apenas para{" "}
              <strong>{pacienteSelecionado?.nome}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => void salvar(false)} className="mt-0">
              Apenas {pacienteSelecionado?.nome?.split(" ")[0]}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void salvar(true)}>
              Sim, replicar para todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resumo pós-salvamento */}
      <AlertDialog open={!!resumo} onOpenChange={(o) => { if (!o) { setResumo(null); nav({ to: "/app/visitas" }); } }}>
        <AlertDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Visita registrada
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-left">
                <div className="text-sm">
                  {resumo?.replicado
                    ? <>A visita foi <strong>replicada para {resumo?.pacientes.length} membros</strong> da família. Cada paciente recebeu seu próprio registro individual.</>
                    : <>Registro individual criado para <strong>{resumo?.pacientes[0]?.nome}</strong>.</>}
                </div>

                {/* Membros */}
                <section className="rounded-md border">
                  <header className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b text-xs font-semibold uppercase tracking-wide">
                    <Users className="h-3.5 w-3.5" /> Pacientes incluídos ({resumo?.pacientes.length})
                  </header>
                  <ul className="divide-y">
                    {resumo?.pacientes.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="truncate">{p.nome}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Campos compartilhados */}
                <section className="rounded-md border">
                  <header className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b text-xs font-semibold uppercase tracking-wide">
                    <ClipboardList className="h-3.5 w-3.5" /> Campos compartilhados em todos os registros
                  </header>
                  <dl className="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <ResumoItem icon={<Calendar className="h-3.5 w-3.5" />} label="Data" value={dataVisita} />
                    <ResumoItem label="Turno" value={TURNOS.find((t) => t.value === turno)?.label} />
                    <ResumoItem label="Desfecho" value={DESFECHOS.find((d) => d.value === desfecho)?.label} />
                    <ResumoItem label="Microárea" value={domicilio?.microarea ?? "—"} />
                    <ResumoItem icon={<MapPin className="h-3.5 w-3.5" />} label="Endereço" value={endereco || enderecoDom} className="sm:col-span-2" />
                    <ResumoItem label="GPS" value={geo ? `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}` : "—"} className="sm:col-span-2" />
                    <ResumoItem
                      label="Motivos"
                      value={motivos.map((v) => MOTIVOS_VISITA.find((m) => m.value === v)?.label).filter(Boolean).join(", ") || "—"}
                      className="sm:col-span-2"
                    />
                    {acomps.length > 0 && (
                      <ResumoItem
                        label="Acompanhamentos"
                        value={acomps.map((v) => ACOMPANHAMENTOS.find((m) => m.value === v)?.label).filter(Boolean).join(", ")}
                        className="sm:col-span-2"
                      />
                    )}
                    {ctrlAmb.length > 0 && (
                      <ResumoItem
                        label="Controle vetorial"
                        value={ctrlAmb.map((v) => CONTROLE_AMBIENTAL.find((m) => m.value === v)?.label).filter(Boolean).join(", ")}
                        className="sm:col-span-2"
                      />
                    )}
                    {(peso || altura) && (
                      <ResumoItem label="Antropometria" value={`${peso || "—"} kg · ${altura || "—"} m`} />
                    )}
                    {(pasis || padia) && (
                      <ResumoItem label="PA" value={`${pasis || "—"} / ${padia || "—"} mmHg`} />
                    )}
                    <ResumoItem
                      icon={<FileSignature className="h-3.5 w-3.5" />}
                      label="Assinatura"
                      value={recusou ? `Recusada: ${motivoRecusa}` : (assinatura ? "Coletada" : "—")}
                      className="sm:col-span-2"
                    />
                    {resumo && resumo.fotosCount > 0 && (
                      <ResumoItem icon={<Camera className="h-3.5 w-3.5" />} label="Fotos" value={`${resumo.fotosCount} anexada(s)`} />
                    )}
                  </dl>
                </section>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { setResumo(null); nav({ to: "/app/visitas" }); }}>
              Concluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ResumoItem({
  icon,
  label,
  value,
  className = "",
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col ${className}`}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </dt>
      <dd className="text-sm break-words">{value || "—"}</dd>
    </div>
  );
}
