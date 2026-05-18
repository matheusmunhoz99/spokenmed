import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarDays, CalendarPlus, Users, Menu, ListOrdered, ClipboardList } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { haptic } from "@/hooks/use-haptics";
import type { ModuleKey } from "@/lib/permissions";

type Item = { title: string; url: string; icon: any; exact?: boolean; module?: ModuleKey };

const allItems: Item[] = [
  { title: "Início", url: "/app", icon: LayoutDashboard, exact: true },
  { title: "Agenda", url: "/app/agenda-dia", icon: CalendarDays, module: "agenda_dia" },
  { title: "Recepção", url: "/app/recepcao", icon: ClipboardList, module: "recepcao" },
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/90 backdrop-blur-xl backdrop-saturate-150 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const active = isActive(it.url, it.exact);
          return (
            <li key={it.url}>
              <Link
                to={it.url}
                onClick={() => haptic("selection")}
                className={`group relative flex h-[60px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-b-full bg-primary"
                  />
                )}
                <it.icon
                  className={`h-[22px] w-[22px] transition-transform ${active ? "scale-110" : "group-active:scale-95"}`}
                  strokeWidth={active ? 2.4 : 1.8}
                />
                <span className="leading-none">{it.title}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => {
              haptic("selection");
              setOpenMobile(true);
            }}
            className="group flex h-[60px] w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Menu className="h-[22px] w-[22px] transition-transform group-active:scale-95" strokeWidth={1.8} />
            <span className="leading-none">Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
