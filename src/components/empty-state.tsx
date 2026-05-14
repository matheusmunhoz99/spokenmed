import { type LucideIcon, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  icon?: LucideIcon;
  title?: string;
  description?: ReactNode;
  action?: { label: string; onClick: () => void; icon?: LucideIcon };
  className?: string;
  compact?: boolean;
};

export function EmptyState({ icon: Icon = Inbox, title = "Sem dados", description, action, className, compact }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-card text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      {action && (
        <Button size="sm" variant="outline" onClick={action.onClick} className="mt-2">
          {action.icon && <action.icon className="mr-1 h-4 w-4" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
