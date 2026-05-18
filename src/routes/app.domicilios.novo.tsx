import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, X, Plus, UserPlus, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { SignaturePad } from "@/components/signature-pad";
import { GeolocationCapture, type GeoCoord } from "@/components/geolocation-capture";
import {
  TIPO_IMOVEL, TIPO_DOMICILIO, SITUACAO_MORADIA, MATERIAL_PAREDES,
  ABASTECIMENTO_AGUA, AGUA_CONSUMO, ESGOTO, DESTINO_LIXO, ANIMAIS, PARENTESCO,
} from "@/lib/domicilios-constants";

export const Route = createFileRoute("/app/domicilios/novo")({ component: NovoDomicilioPage });

type Membro = {
  paciente_id: string;
  nome: string;
  cpf: string | null;
  parentesco: string;
  is_responsavel: boolean;
};

function NovoDomicilioPage() {
  const nav = useNavigate();
  const { user } = useAuth();

  // endereço
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [ponto, setPonto] = useState("");
  const [microarea, setMicroarea] = useState("");
  const [geo, setGeo] = useState<GeoCoord | null>(null);

  // características
  const [tipoImovel, setTipoImovel] = useState("casa");
  const [tipoDom, setTipoDom] = useState("proprio");
  const [sitMor, setSitMor] = useState("urbana");
  const [paredes, setParedes] = useState("alvenaria");
  const [comodos, setComodos] = useState("");
  const [dorm, setDorm] = useState("");
  const [agua, setAgua] = useState("rede");
  const [aguaCons, setAguaCons] = useState("filtrada");
  const [esgoto, setEsgoto] = useState("rede");
  const [lixo, setLixo] = useState("coletado");
  const [energia, setEnergia] = useState(true);
  const [animais, setAnimais] = useState<string[]>([]);

  // família
  const [prontuario, setProntuario] = useState("");
  const [renda, setRenda] = useState("");
  const [bolsa, setBolsa] = useState(false);
  const [rua, setRua] = useState(false);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [busca, setBusca] = useState("");

  // novo paciente rápido
  const [novoNome, setNovoNome] = useState("");
  const [novoCpf, setNovoCpf] = useState("");
  const [novoNasc, setNovoNasc] = useState("");
  const [novoSexo, setNovoSexo] = useState<"M" | "F" | "O">("F");

  // assinatura + obs
  const [obs, setObs] = useState("");
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [recusou, setRecusou] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState("");

  const [saving, setSaving] = useState(false);

  const { data: pacientes } = useQuery({
    queryKey: ["pac-busca-dom", busca],
    enabled: busca.trim().length >= 3,
    queryFn: async () => {
      const t = busca.replace(/\D/g, "");
      let q = supabase.from("pacientes").select("id, nome, cpf, data_nascimento").eq("ativo", true).limit(15);
      q = t.length >= 3 ? q.or(`nome.ilike.%${busca}%,cpf.ilike.%${t}%`) : q.ilike("nome", `%${busca}%`);
      return (await q).data ?? [];
    },
  });

  const buscarCep = async () => {
    const c = cep.replace(/\D/g, "");
    if (c.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
      const j = await r.json();
      if (j.erro) return;
      setLogradouro(j.logradouro ?? "");
      setBairro(j.bairro ?? "");
      setCidade(j.localidade ?? "");
      setUf(j.uf ?? "");
    } catch {}
  };

  const addMembro = (p: any) => {
    if (membros.some((m) => m.paciente_id === p.id)) {
      toast.error("Esta pessoa já está na família.");
      return;
    }
    const isFirst = membros.length === 0;
    setMembros([...membros, {
      paciente_id: p.id, nome: p.nome, cpf: p.cpf,
      parentesco: isFirst ? "responsavel" : "filho", is_responsavel: isFirst,
    }]);
    setBusca("");
  };

  const criarPaciente = async () => {
    if (!novoNome.trim()) { toast.error("Informe o nome."); return; }
    const cpfLimpo = novoCpf.replace(/\D/g, "") || null;
    const { data, error } = await supabase.from("pacientes")
      .insert({ nome: novoNome.trim(), cpf: cpfLimpo, data_nascimento: novoNasc || null, sexo: novoSexo, ativo: true })
      .select("id, nome, cpf").single();
    if (error) { toast.error("Erro ao criar paciente: " + error.message); return; }
    addMembro(data);
    setNovoNome(""); setNovoCpf(""); setNovoNasc("");
    toast.success("Paciente criado e adicionado à família.");
  };

  const updateMembro = (id: string, patch: Partial<Membro>) =>
    setMembros(membros.map((m) => m.paciente_id === id ? { ...m, ...patch } : m));

  const setResponsavel = (id: string) =>
    setMembros(membros.map((m) => ({ ...m, is_responsavel: m.paciente_id === id, parentesco: m.paciente_id === id ? "responsavel" : (m.parentesco === "responsavel" ? "outro" : m.parentesco) })));

  const removeMembro = (id: string) => setMembros(membros.filter((m) => m.paciente_id !== id));

  const toggleAnimal = (v: string) =>
    setAnimais(animais.includes(v) ? animais.filter((x) => x !== v) : [...animais, v]);

  const salvar = async () => {
    if (!logradouro.trim()) { toast.error("Informe o logradouro."); return; }
    if (!geo) { toast.error("GPS é obrigatório."); return; }
    if (membros.length === 0) { toast.error("Adicione ao menos um morador à família."); return; }
    if (!membros.some((m) => m.is_responsavel)) { toast.error("Indique a pessoa de referência da família."); return; }
    if (!recusou && !assinatura) {
      // assinatura é opcional aqui — só obrigatória se quiser registrar; vamos exigir uma das duas
      // mantenho leniente: assinatura é opcional no cadastro domiciliar
    }
    if (recusou && !motivoRecusa.trim()) { toast.error("Informe o motivo da recusa."); return; }

    setSaving(true);
    try {
      const responsavel = membros.find((m) => m.is_responsavel)!;

      const { data: dom, error: errDom } = await supabase.from("domicilios").insert({
        acs_user_id: user!.id,
        unidade_id: null,
        microarea: microarea || null,
        cep: cep.replace(/\D/g, "") || null,
        logradouro: logradouro.trim(),
        numero: numero || null,
        complemento: complemento || null,
        bairro: bairro || null,
        cidade: cidade || null,
        uf: uf || null,
        ponto_referencia: ponto || null,
        latitude: geo.latitude,
        longitude: geo.longitude,
        gps_accuracy: geo.accuracy,
        gps_capturado_em: geo.captured_at,
        tipo_imovel: tipoImovel,
        tipo_domicilio: tipoDom,
        situacao_moradia: sitMor,
        material_paredes: paredes,
        num_moradores: membros.length,
        num_comodos: comodos ? parseInt(comodos, 10) : null,
        num_dormitorios: dorm ? parseInt(dorm, 10) : null,
        abastecimento_agua: agua,
        agua_consumo: aguaCons,
        esgoto,
        destino_lixo: lixo,
        energia_eletrica: energia,
        animais,
        observacoes: obs || null,
        assinatura_responsavel: recusou ? null : assinatura,
        assinatura_recusada: recusou,
        assinatura_recusa_motivo: recusou ? motivoRecusa : null,
      }).select("id").single();
      if (errDom) throw new Error(errDom.message);

      const { data: fam, error: errFam } = await supabase.from("familias").insert({
        domicilio_id: dom.id,
        prontuario_familiar: prontuario || null,
        responsavel_paciente_id: responsavel.paciente_id,
        renda_familiar: renda ? Number(renda.replace(",", ".")) : null,
        bolsa_familia: bolsa,
        situacao_rua: rua,
      }).select("id").single();
      if (errFam) throw new Error(errFam.message);

      const { error: errMem } = await supabase.from("familia_membros").insert(
        membros.map((m) => ({
          familia_id: fam.id,
          paciente_id: m.paciente_id,
          parentesco: m.parentesco,
          is_responsavel: m.is_responsavel,
        })),
      );
      if (errMem) throw new Error(errMem.message);

      toast.success("Domicílio cadastrado com sucesso");
      nav({ to: "/app/domicilios" });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-24">
      <h1 className="text-2xl font-bold">Novo Cadastro Domiciliar</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Endereço</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label>CEP</Label>
            <Input value={cep} onChange={(e) => setCep(e.target.value)} onBlur={buscarCep} placeholder="00000-000" />
          </div>
          <div><Label>Microárea</Label><Input value={microarea} onChange={(e) => setMicroarea(e.target.value)} /></div>
          <div className="col-span-2"><Label>Logradouro *</Label><Input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} /></div>
          <div><Label>Número</Label><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
          <div><Label>Complemento</Label><Input value={complemento} onChange={(e) => setComplemento(e.target.value)} /></div>
          <div><Label>Bairro</Label><Input value={bairro} onChange={(e) => setBairro(e.target.value)} /></div>
          <div><Label>Cidade</Label><Input value={cidade} onChange={(e) => setCidade(e.target.value)} /></div>
          <div><Label>UF</Label><Input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} /></div>
          <div className="col-span-2"><Label>Ponto de referência</Label><Input value={ponto} onChange={(e) => setPonto(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. GPS (obrigatório)</CardTitle></CardHeader>
        <CardContent><GeolocationCapture value={geo} onChange={setGeo} required /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">3. Características do imóvel</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <SelectField label="Tipo de imóvel" value={tipoImovel} onChange={setTipoImovel} options={TIPO_IMOVEL} />
          <SelectField label="Tipo de domicílio" value={tipoDom} onChange={setTipoDom} options={TIPO_DOMICILIO} />
          <SelectField label="Situação" value={sitMor} onChange={setSitMor} options={SITUACAO_MORADIA} />
          <SelectField label="Paredes" value={paredes} onChange={setParedes} options={MATERIAL_PAREDES} />
          <div><Label>Nº cômodos</Label><Input inputMode="numeric" value={comodos} onChange={(e) => setComodos(e.target.value)} /></div>
          <div><Label>Nº dormitórios</Label><Input inputMode="numeric" value={dorm} onChange={(e) => setDorm(e.target.value)} /></div>
          <SelectField label="Abastecimento de água" value={agua} onChange={setAgua} options={ABASTECIMENTO_AGUA} />
          <SelectField label="Água para consumo" value={aguaCons} onChange={setAguaCons} options={AGUA_CONSUMO} />
          <SelectField label="Esgoto" value={esgoto} onChange={setEsgoto} options={ESGOTO} />
          <SelectField label="Destino do lixo" value={lixo} onChange={setLixo} options={DESTINO_LIXO} />
          <div className="col-span-2 flex items-center gap-2 pt-1">
            <Checkbox checked={energia} onCheckedChange={(v) => setEnergia(!!v)} id="energia" />
            <Label htmlFor="energia" className="cursor-pointer">Energia elétrica disponível</Label>
          </div>
          <div className="col-span-2">
            <Label>Animais no domicílio</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ANIMAIS.map((a) => (
                <label key={a.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={animais.includes(a.value)} onCheckedChange={() => toggleAnimal(a.value)} />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><UsersIcon className="h-4 w-4" /> 4. Família</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Prontuário familiar</Label><Input value={prontuario} onChange={(e) => setProntuario(e.target.value)} /></div>
            <div><Label>Renda familiar (R$)</Label><Input inputMode="decimal" value={renda} onChange={(e) => setRenda(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={bolsa} onCheckedChange={(v) => setBolsa(!!v)} /><span>Bolsa Família</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={rua} onCheckedChange={(v) => setRua(!!v)} /><span>Em situação de rua</span>
            </label>
          </div>

          <div className="border-t pt-3">
            <Label className="mb-1 block">Moradores</Label>
            {membros.length > 0 && (
              <div className="space-y-2 mb-3">
                {membros.map((m) => (
                  <div key={m.paciente_id} className="rounded-md border p-2 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-12 sm:col-span-5">
                      <div className="font-medium text-sm">{m.nome}</div>
                      <div className="text-xs text-muted-foreground">{m.cpf ?? "Sem CPF"}</div>
                    </div>
                    <div className="col-span-7 sm:col-span-4">
                      <Select value={m.parentesco} onValueChange={(v) => updateMembro(m.paciente_id, { parentesco: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{PARENTESCO.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 sm:col-span-2 flex items-center gap-1">
                      <Checkbox checked={m.is_responsavel} onCheckedChange={() => setResponsavel(m.paciente_id)} id={`r-${m.paciente_id}`} />
                      <Label htmlFor={`r-${m.paciente_id}`} className="text-xs cursor-pointer">Ref.</Label>
                    </div>
                    <div className="col-span-2 sm:col-span-1 text-right">
                      <Button size="icon" variant="ghost" onClick={() => removeMembro(m.paciente_id)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 rounded-md border bg-muted/30 p-2">
              <Label className="text-xs">Buscar paciente existente (nome ou CPF)</Label>
              <Input placeholder="Digite ao menos 3 caracteres" value={busca} onChange={(e) => setBusca(e.target.value)} />
              {pacientes && pacientes.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded border bg-background divide-y">
                  {pacientes.map((p: any) => (
                    <button key={p.id} type="button" onClick={() => addMembro(p)}
                      className="w-full text-left px-2 py-1.5 hover:bg-muted text-sm flex items-center justify-between">
                      <span><span className="font-medium">{p.nome}</span> <span className="text-xs text-muted-foreground">{p.cpf ?? ""}</span></span>
                      <Plus className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <details className="rounded-md border p-2">
              <summary className="text-sm font-medium cursor-pointer flex items-center gap-1"><UserPlus className="h-4 w-4" /> Cadastrar novo morador</summary>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="col-span-2"><Label className="text-xs">Nome completo *</Label><Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} /></div>
                <div><Label className="text-xs">CPF</Label><Input value={novoCpf} onChange={(e) => setNovoCpf(e.target.value)} /></div>
                <div><Label className="text-xs">Nascimento</Label><Input type="date" value={novoNasc} onChange={(e) => setNovoNasc(e.target.value)} /></div>
                <div>
                  <Label className="text-xs">Sexo</Label>
                  <Select value={novoSexo} onValueChange={(v: any) => setNovoSexo(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="F">Feminino</SelectItem>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="O">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Button type="button" size="sm" onClick={criarPaciente} className="w-full"><UserPlus className="mr-1 h-4 w-4" /> Criar e adicionar</Button></div>
              </div>
            </details>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">5. Observações</CardTitle></CardHeader>
        <CardContent><Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">6. Assinatura do responsável (opcional)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!recusou && <SignaturePad value={assinatura} onChange={setAssinatura} />}
          <label className="flex items-center gap-2 text-sm pt-2 border-t">
            <Checkbox checked={recusou} onCheckedChange={(v) => { setRecusou(!!v); if (v) setAssinatura(null); }} />
            <span>Responsável recusou / impossibilitado de assinar</span>
          </label>
          {recusou && <Input placeholder="Motivo" value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} />}
        </CardContent>
      </Card>

      <div
        className="sticky bottom-0 bg-background/95 backdrop-blur border-t p-3 -mx-4 flex gap-2 z-10"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <Button variant="outline" onClick={() => nav({ to: "/app/domicilios" })} className="flex-1 h-11">Cancelar</Button>
        <Button onClick={salvar} disabled={saving} className="flex-1 h-11"><Save className="mr-1 h-4 w-4" />{saving ? "Salvando..." : "Salvar domicílio"}</Button>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
