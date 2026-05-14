import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useShortcutsHelp, SHORTCUTS } from "@/hooks/use-shortcuts";
import { Keyboard } from "lucide-react";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

export function ShortcutsHelp() {
  const { helpOpen, setHelpOpen } = useShortcutsHelp();
  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Keyboard className="h-4 w-4" /> Atalhos de teclado</DialogTitle>
          <DialogDescription>Acelere a navegação. Pressione <Kbd>?</Kbd> a qualquer momento para reabrir esta janela.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between py-2">
              <span className="text-sm text-foreground">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.split(" ").map((k, i) => (
                  <Kbd key={i}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">Atalhos são desativados enquanto você digita em um campo.</p>
      </DialogContent>
    </Dialog>
  );
}
