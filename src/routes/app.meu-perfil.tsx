import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, ShieldCheck, UserCog } from "lucide-react";

export const Route = createFileRoute("/app/meu-perfil")({
  component: MeuPerfilPage,
});

const CONSELHOS = [
  { v: "CRM", l: "CRM — Medicina" },
  { v: "CRO", l: "CRO — Odontologia" },
  { v: "CRP", l: "CRP — Psicologia" },
  { v: "COREN", l: "COREN — Enfermagem" },
  { v: "CRF", l: "CRF — Farmácia" },
  { v: "CREFITO", l: "CREFITO — Fisio/T.O." },
  { v: "CRN", l: "CRN — Nutrição" },
  { v: "CRFa", l: "CRFa — Fonoaudiologia" },
  { v: "CRBM", l: "CRBM — Biomedicina" },
];

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

function MeuPerfilPage() {
  const { user, profile } = useAuth();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cargo, setCargo] = useState("");
  const [conselhoTipo, setConselhoTipo] = useState("CRM");
  const [conselhoNumero, setConselhoNumero] = useState("");
  const [conselhoUf, setConselhoUf] = useState("RJ");
  const [cbo, setCbo] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [rqe, setRqe] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        setNome(data.nome || "");
        setTelefone(data.telefone || "");
        setCargo(data.cargo || "");
        setConselhoTipo(data.conselho_tipo || "CRM");
        setConselhoNumero(data.conselho_numero || "");
        setConselhoUf(data.conselho_uf || "RJ");
        setCbo(data.cbo || "");
        setEspecialidade(data.especialidade || "");
        setRqe(data.rqe || "");
      }
      setLoading(false);
    })();
  }, [user]);

  const salvar = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      nome: nome.trim() || profile?.nome || "Profissional",
      telefone: telefone.trim() || null,
      cargo: cargo.trim() || null,
      conselho_tipo: conselhoTipo,
      conselho_numero: conselhoNumero.trim() || null,
      conselho_uf: conselhoUf,
      cbo: cbo.trim() || null,
      especialidade: especialidade.trim() || null,
      rqe: rqe.trim() || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Perfil atualizado");
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando…</div>;
  }

  const conselhoOk = conselhoNumero.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><UserCog className="h-5 w-5" /></div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Meu Perfil</h2>
            <p className="text-sm text-muted-foreground">
              Estes dados aparecem em receitas, atestados, SADT, LME e outros documentos que você emite.
              O <strong>conselho profissional</strong> é obrigatório para imprimir documentos.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-semibold">Dados pessoais</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nome completo</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(21) 99999-9999" />
          </div>
          <div className="sm:col-span-2">
            <Label>Cargo / Função</Label>
            <Input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Médico Clínico Geral" />
          </div>
        </div>
      </div>

      <div className={`rounded-xl border p-5 space-y-4 ${conselhoOk ? "bg-card" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"}`}>
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-5 w-5 ${conselhoOk ? "text-emerald-600" : "text-amber-600"}`} />
          <h3 className="font-semibold">Conselho profissional</h3>
          {!conselhoOk && <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Obrigatório para emitir documentos</span>}
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
          <div>
            <Label>Conselho</Label>
            <select value={conselhoTipo} onChange={(e) => setConselhoTipo(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
              {CONSELHOS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          <div>
            <Label>Número de inscrição</Label>
            <Input value={conselhoNumero} onChange={(e) => setConselhoNumero(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Ex.: 123456" />
          </div>
          <div>
            <Label>UF</Label>
            <select value={conselhoUf} onChange={(e) => setConselhoUf(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
              {UFS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>CBO</Label>
            <Input value={cbo} onChange={(e) => setCbo(e.target.value)} placeholder="225125" />
          </div>
          <div>
            <Label>Especialidade</Label>
            <Input value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} placeholder="Cardiologia" />
          </div>
          <div>
            <Label>RQE (opcional)</Label>
            <Input value={rqe} onChange={(e) => setRqe(e.target.value)} placeholder="Registro de Qualificação" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Será impresso como <strong>{conselhoTipo} {conselhoNumero || "______"}/{conselhoUf}</strong> em todos os documentos emitidos.
          O SpokenMED também gera uma assinatura eletrônica (HMAC-SHA256) automaticamente em cada PDF, verificável publicamente em /verificar.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar perfil
        </Button>
      </div>
    </div>
  );
}
