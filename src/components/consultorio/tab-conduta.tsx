"use client";
import { ArrowRight, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type CondutaFlags = {
  desfechos: string[];
  matriciamento: boolean;
  obs: string;
};

export const CONDUTA_DEFAULT: CondutaFlags = { desfechos: [], matriciamento: false, obs: "" };

const DESFECHOS = [
  "Retorno p/ consulta agendada",
  "Retorno p/ cuidado continuado",
  "Agendamento p/ grupos",
  "Alta do episódio",
  "Encaminhamento interno no dia",
  "Encaminhamento intersetorial",
  "Encaminhamento p/ serviço especializado",
  "Encaminhamento p/ CAPS",
  "Encaminhamento p/ internação hospitalar",
  "Encaminhamento p/ urgência/emergência",
  "Encaminhamento p/ serviço atenção domiciliar",
];

interface Props { v: CondutaFlags; set: (v: CondutaFlags) => void; }

export function TabConduta({ v, set }: Props) {
  const toggle = (d: string) => set({ ...v, desfechos: v.desfechos.includes(d) ? v.desfechos.filter(x => x !== d) : [...v.desfechos, d] });
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary"><ArrowRight className="h-3.5 w-3.5" /></div>
          <Label className="text-sm font-semibold">Conduta / desfecho</Label>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Multi</span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {DESFECHOS.map((d) => {
            const active = v.desfechos.includes(d);
            return (
              <label key={d} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${active ? "border-primary bg-primary/8 ring-1 ring-primary/30" : "border-border hover:bg-accent/40"}`}>
                <Checkbox checked={active} onCheckedChange={() => toggle(d)} />
                <span>{d}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary"><Users className="h-3.5 w-3.5" /></div>
          <Label className="text-sm font-semibold">NASF / eMulti — matriciamento</Label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm hover:bg-accent/40">
          <Checkbox checked={v.matriciamento} onCheckedChange={(x) => set({ ...v, matriciamento: !!x })} />
          <span>Solicitar matriciamento NASF/eMulti</span>
        </label>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <Label className="text-sm font-semibold">Observações / racionalidade da conduta</Label>
        <Textarea rows={4} className="mt-2" value={v.obs} onChange={(e) => set({ ...v, obs: e.target.value })} />
      </div>
    </div>
  );
}
