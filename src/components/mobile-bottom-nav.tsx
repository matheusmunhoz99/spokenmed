import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarDays, CalendarPlus, Users, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

const items = [
  { title: "Início", url: "/app", icon: LayoutDashboard, exact: true },
  { title: "Agenda", url: "/app/agenda-dia", icon: CalendarDays },
  { title: "Agendar", url: "/app/agendar", icon: CalendarPlus },
  { title: "Pacientes", url: "/app/pacientes", icon: Users },
];

export function MobileBottomNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { setOpenMobile } = useSidebar();

  const isActive = (u: string, exact?: boolean) =>
    exact ? path === u : path === u || path.startsWith(u + "/") || path === u;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid grid-cols-5">
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
