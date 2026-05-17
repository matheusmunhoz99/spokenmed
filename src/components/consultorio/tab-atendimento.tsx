"use client";
import { Activity, Baby, Beaker, Flame, Globe2, Home, Leaf, MapPin, Phone, Shield, Syringe, Video } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type AtendimentoFlags = {
  tipoAtendimento: string;
  tipoConsulta: string;
  modalidade: string;
  local: string;
  aleitamento: string;
  pics: boolean;
  vacinacao: string;
  racionalidade: string;
  notificacoes: string[];
};

export const ATENDIMENTO_DEFAULT: AtendimentoFlags = {
  tipoAtendimento: "consulta_agendada",
  tipoConsulta: "primeira",
  modalidade: "presencial",
  local: "ubs",
  aleitamento: "nao_se_aplica",
  pics: false,
  vacinacao: "sim",
  racionalidade: "alopatia",
  notificacoes: [],
};

const TIPO_ATENDIMENTO = [
  { v: "consulta_agendada", l: "Consulta agendada" },
  { v: "cuidado_continuado", l: "Consulta agendada programada / cuidado continuado" },
  { v: "escuta_inicial", l: "Escuta inicial / orientação" },
  { v: "demanda_espontanea", l: "Atendimento de demanda espontânea" },
  { v: "consulta_no_dia", l: "Consulta no dia" },
  { v: "urgencia", l: "Urgência" },
];

const TIPO_CONSULTA = [
  { v: "primeira", l: "1ª consulta" },
  { v: "retorno", l: "Retorno em < 72h" },
  { v: "agendada", l: "Agendada" },
  { v: "acolhimento", l: "Acolhimento" },
];

const MODALIDADE = [
  { v: "presencial", l: "Presencial", icon: Home },
  { v: "tele_sincrono", l: "Telessaúde síncrono", icon: Video },
  { v: "tele_assincrono", l: "Telessaúde assíncrono", icon: Phone },
];

const NOTIFICACOES = [
  "Dengue", "Chikungunya", "Zika", "Sífilis",
  "Tuberculose", "Hanseníase", "Violência interpessoal", "Acidente de trabalho",
];

interface Props {
  v: AtendimentoFlags;
  set: (v: AtendimentoFlags) => void;
}

export function TabAtendimento({ v, set }: Props) {
  const upd = <K extends keyof AtendimentoFlags>(k: K, val: AtendimentoFlags[K]) => set({ ...v, [k]: val });

  const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left text-sm transition-all hover:border-primary/50 hover:bg-accent/40 ${
        active ? "border-primary bg-primary/8 ring-1 ring-primary/30 font-medium text-foreground" : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <Section icon={Activity} title="Tipo de atendimento" tag="Obrigatório">
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPO_ATENDIMENTO.map((o) => (
            <Pill key={o.v} active={v.tipoAtendimento === o.v} onClick={() => upd("tipoAtendimento", o.v)}>{o.l}</Pill>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={Beaker} title="Tipo de consulta">
          <div className="grid gap-2 sm:grid-cols-2">
            {TIPO_CONSULTA.map((o) => (
              <Pill key={o.v} active={v.tipoConsulta === o.v} onClick={() => upd("tipoConsulta", o.v)}>{o.l}</Pill>
            ))}
          </div>
        </Section>
        <Section icon={Video} title="Modalidade de atendimento">
          <div className="grid gap-2 sm:grid-cols-3">
            {MODALIDADE.map((o) => (
              <Pill key={o.v} active={v.modalidade === o.v} onClick={() => upd("modalidade", o.v)}>
                <o.icon className="mb-1 h-3.5 w-3.5" /><br />{o.l}
              </Pill>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section icon={MapPin} title="Local de atendimento">
          <Select value={v.local} onValueChange={(x) => upd("local", x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ubs">UBS</SelectItem>
              <SelectItem value="domicilio">Domicílio</SelectItem>
              <SelectItem value="rua">Rua</SelectItem>
              <SelectItem value="escola">Escola/creche</SelectItem>
              <SelectItem value="academia">Polo Academia da Saúde</SelectItem>
              <SelectItem value="instituicao">Instituição/abrigo</SelectItem>
              <SelectItem value="unidade_movel">Unidade móvel</SelectItem>
              <SelectItem value="outros">Outros</SelectItem>
            </SelectContent>
          </Select>
        </Section>
        <Section icon={Syringe} title="Vacinação em dia?">
          <div className="grid grid-cols-3 gap-2">
            {[["sim","Sim"],["nao","Não"],["nv","Não verificado"]].map(([val,label]) => (
              <Pill key={val} active={v.vacinacao === val} onClick={() => upd("vacinacao", val)}>{label}</Pill>
            ))}
          </div>
        </Section>
        <Section icon={Baby} title="Aleitamento materno">
          <Select value={v.aleitamento} onValueChange={(x) => upd("aleitamento", x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="exclusivo">Exclusivo</SelectItem>
              <SelectItem value="predominante">Predominante</SelectItem>
              <SelectItem value="complementado">Complementado</SelectItem>
              <SelectItem value="inexistente">Inexistente</SelectItem>
              <SelectItem value="nao_se_aplica">Não se aplica</SelectItem>
            </SelectContent>
          </Select>
        </Section>
      </div>

      <Section icon={Flame} title="Notificação de agravo / doença" tag="Multi">
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {NOTIFICACOES.map((n) => {
            const active = v.notificacoes.includes(n);
            return (
              <label key={n} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${active ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-border hover:bg-accent/40"}`}>
                <Checkbox checked={active} onCheckedChange={() => upd("notificacoes", active ? v.notificacoes.filter(x=>x!==n) : [...v.notificacoes, n])} />
                <span>{n}</span>
              </label>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={Leaf} title="Plantas medicinais / PICs em uso?">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm hover:bg-accent/40">
            <Checkbox checked={v.pics} onCheckedChange={(x) => upd("pics", !!x)} />
            <span>Sim, paciente faz uso atualmente</span>
          </label>
        </Section>
        <Section icon={Globe2} title="Racionalidade em saúde">
          <Select value={v.racionalidade} onValueChange={(x) => upd("racionalidade", x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alopatia">Alopatia / convencional</SelectItem>
              <SelectItem value="mtc">Medicina tradicional chinesa</SelectItem>
              <SelectItem value="antroposofia">Antroposofia</SelectItem>
              <SelectItem value="homeopatia">Homeopatia</SelectItem>
              <SelectItem value="fitoterapia">Fitoterapia</SelectItem>
              <SelectItem value="ayurveda">Ayurveda</SelectItem>
            </SelectContent>
          </Select>
        </Section>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, tag, children }: { icon: any; title: string; tag?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <Label className="text-sm font-semibold tracking-tight">{title}</Label>
        {tag && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{tag}</span>}
      </div>
      {children}
    </div>
  );
}
