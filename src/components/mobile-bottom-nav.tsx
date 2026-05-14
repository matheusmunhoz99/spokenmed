import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarDays, CalendarPlus, Users, Menu, ListOrdered } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import type { ModuleKey } from "@/lib/permissions";

type Item = { title: string; url: string; icon: any; exact?: boolean; module?: ModuleKey };

const allItems: Item[] = [
  { title: "Início", url: "/app", icon: LayoutDashboard, exact: true },
  { title: "Agenda", url: "/app/agenda-dia", icon: CalendarDays, module: "agenda_dia" },
  { title: "Agendar", url: "/app/agendar", icon: CalendarPlus, module: "agendar" },
  { title: "Fila", url: "/app/fila", icon: ListOrdered, module: "fila" },
  { title: "Pacientes", url: "/app/pacientes", icon: Users, module: "pacientes" },
];

export function MobileBottomNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { setOpenMobile } = useSidebar();
  const { can } = useAuth();

  const items = allItems.filter((it) => !it.module || can(it.module, "view"));

  const isActive = (u: string, exact?: boolean) =>
    exact ? path === u : path === u || path.startsWith(u + "/") || path === u;

  const cols = items.length + 1;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const active = isActive(it.url, it.exact);
          return (
            <li key={it.url}>
              <Link
                to={it.url}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <it.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                <span>{it.title}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-[22px] w-[22px]" strokeWidth={1.8} />
            <span>Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
