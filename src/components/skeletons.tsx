import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 sm:p-4"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="hidden h-8 w-20 rounded-md sm:block" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ items = 4, className }: { items?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)} aria-busy="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-3 h-7 w-1/2" />
          <Skeleton className="mt-4 h-2.5 w-full" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-busy="true">
      <div className="grid border-b border-border bg-muted/40 px-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="mr-4 h-3 w-2/3 last:mr-0" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid border-b border-border px-4 py-3 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="mr-4 h-3.5 w-4/5 last:mr-0" />
          ))}
        </div>
      ))}
    </div>
  );
}
