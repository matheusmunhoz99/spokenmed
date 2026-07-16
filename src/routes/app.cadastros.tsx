import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SemAcesso } from "@/components/sem-acesso";
import { Card, CardContent } from "@/components/ui/card";
import {
  Building2, GraduationCap, UsersRound, ClipboardList,
  Stethoscope, ListOrdered, ShieldCheck, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";

import { UnidadesCard, EspecialidadesCard, EquipesCard, ProcedimentosCard } from "./app.configuracoes";
import { ProfissionaisPage } from "./app.profissionais";
import { CotasPage } from "./app.configuracoes.cotas";
import { ConfigSistema } from "./app.configuracoes.sistema";

const tabSchema = z.object({
  tab: z
    .enum(["inicio", "unidades", "especialidades", "equipes", "procedimentos", "profissionais", "cotas", "usuarios"])
    .catch("inicio")
    .optional(),
});

export const Route = createFileRoute("/app/cadastros")({
  validateSearch: tabSchema,
  component: CadastrosHub,
});

type TabDef = {
  key: string;
  label: string;
  short: string;
  icon: any;
  description: string;
  module?: string;
  adminOnly?: boolean;
  accent: string;
};

const TABS: TabDef[] = [
  { key: "unidades", label: "Unidades de Saúde", short: "Unidades", icon: Building2, description: "UBS, postos e hospitais municipais", module: "unidades_especialidades", accent: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400" },
  { key: "especialidades", label: "Especialidades", short: "Especialidades", icon: GraduationCap, description: "Áreas de atendimento dos profissionais", module: "unidades_especialidades", accent: "from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400" },
  { key: "equipes", label: "Equipes eSF/eAP", short: "Equipes", icon: UsersRound, description: "Times de saúde da família com INE", module: "unidades_especialidades", accent: "from-teal-500/15 to-teal-500/5 text-teal-600 dark:text-teal-400" },
  { key: "procedimentos", label: "Procedimentos SIGTAP", short: "Procedimentos", icon: ClipboardList, description: "Tabela de procedimentos SUS", module: "unidades_especialidades", accent: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400" },
  { key: "profissionais", label: "Profissionais", short: "Profissionais", icon: Stethoscope, description: "Médicos, enfermeiros e demais profissionais", module: "profissionais", accent: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400" },
  { key: "cotas", label: "Cotas de Agendamento", short: "Cotas", icon: ListOrdered, description: "Regime livre ou por cota mensal por UBS", module: "cotas", accent: "from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400" },
  { key: "usuarios", label: "Usuários & Permissões", short: "Usuários", icon: ShieldCheck, description: "Contas, perfis e módulos liberados", adminOnly: true, accent: "from-indigo-500/15 to-indigo-500/5 text-indigo-600 dark:text-indigo-400" },
];

function CadastrosHub() {
  const { can, isAdmin } = useAuth();
  const { tab } = Route.useSearch();
  const active = tab ?? "inicio";

  const visible = TABS.filter((t) => {
    if (t.adminOnly && !isAdmin) return false;
    if (t.module && !isAdmin && !can(t.module as any, "view")) return false;
    return true;
  });

  if (visible.length === 0) return <SemAcesso />;

  return (
    <div className="space-y-5">
      <TabsBar tabs={visible} active={active} />
      <div>
        {active === "inicio" && <LandingGrid tabs={visible} />}
        {active === "unidades" && <UnidadesCard />}
        {active === "especialidades" && <EspecialidadesCard />}
        {active === "equipes" && <EquipesCard />}
        {active === "procedimentos" && <ProcedimentosCard />}
        {active === "profissionais" && <ProfissionaisPage />}
        {active === "cotas" && <CotasPage />}
        {active === "usuarios" && <ConfigSistema />}
      </div>
    </div>
  );
}

function TabsBar({ tabs, active }: { tabs: TabDef[]; active: string }) {
  const items = [{ key: "inicio", short: "Início", icon: ChevronRight } as any, ...tabs];
  return (
    <div className="sticky top-14 z-20 -mx-4 border-b bg-background/90 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5 md:-mx-6 md:px-6">
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {items.map((t: any) => {
          const isActive = active === t.key;
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              to="/app/cadastros"
              search={t.key === "inicio" ? {} : { tab: t.key }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.short}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function LandingGrid({ tabs }: { tabs: TabDef[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Cadastros & Configurações</h2>
        <p className="text-sm text-muted-foreground">
          Tudo o que a Secretaria precisa configurar num só lugar — clique num cartão para abrir a seção.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tabs.map((t) => <SectionCard key={t.key} tab={t} />)}
      </div>
    </div>
  );
}

function SectionCard({ tab }: { tab: TabDef }) {
  const Icon = tab.icon;
  const count = useSectionCount(tab.key);
  return (
    <Link to="/app/cadastros" search={{ tab: tab.key as any }} className="group block">
      <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br", tab.accent)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm leading-tight">{tab.label}</h3>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
            </div>
            <p className="text-xs text-muted-foreground leading-snug">{tab.description}</p>
          </div>
          <div className="mt-auto pt-1 text-[11px] text-muted-foreground">
            {count === null ? <span className="opacity-0">.</span> : count}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function useSectionCount(key: string): string | null {
  const { data } = useQuery({
    queryKey: ["cadastros-count", key],
    staleTime: 30_000,
    queryFn: async () => {
      const q = (table: any, filter?: (b: any) => any) => {
        let b: any = (supabase as any).from(table).select("*", { count: "exact", head: true });
        if (filter) b = filter(b);
        return b;
      };

      switch (key) {
        case "unidades": {
          const { count } = await q("unidades", (b) => b.eq("ativo", true));
          return `${count ?? 0} ${(count ?? 0) === 1 ? "unidade ativa" : "unidades ativas"}`;
        }
        case "especialidades": {
          const { count } = await q("especialidades", (b) => b.eq("ativo", true));
          return `${count ?? 0} ${(count ?? 0) === 1 ? "especialidade" : "especialidades"}`;
        }
        case "equipes": {
          const { count } = await q("equipes", (b) => b.eq("ativo", true));
          return `${count ?? 0} ${(count ?? 0) === 1 ? "equipe" : "equipes"}`;
        }
        case "procedimentos": {
          const { count } = await q("procedimentos", (b) => b.eq("ativo", true));
          return `${count ?? 0} ${(count ?? 0) === 1 ? "procedimento" : "procedimentos"}`;
        }
        case "profissionais": {
          const { count } = await q("profissionais", (b) => b.eq("ativo", true));
          return `${count ?? 0} ${(count ?? 0) === 1 ? "profissional ativo" : "profissionais ativos"}`;
        }
        case "cotas": {
          const { count } = await q("unidades", (b) => b.eq("regime_agendamento" as any, "cota"));
          return `${count ?? 0} ${(count ?? 0) === 1 ? "UBS por cota" : "UBS por cota"}`;
        }
        case "usuarios": {
          const { count } = await q("profiles");
          return `${count ?? 0} ${(count ?? 0) === 1 ? "usuário" : "usuários"}`;
        }
        default:
          return null;
      }
    },
  });
  return data ?? null;
}
