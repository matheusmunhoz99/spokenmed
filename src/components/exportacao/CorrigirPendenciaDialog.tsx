import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw } from "lucide-react";

export type RotaErro = {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string | number | boolean>;
};

function resolveUrl(rota: RotaErro): string {
  let path = rota.to;
  if (rota.params) {
    for (const [k, v] of Object.entries(rota.params)) {
      path = path.replace(`$${k}`, encodeURIComponent(String(v)));
    }
  }
  const sp = new URLSearchParams();
  if (rota.search) {
    for (const [k, v] of Object.entries(rota.search)) {
      if (v === undefined || v === null || v === "") continue;
      sp.set(k, String(v));
    }
  }
  sp.set("embed", "1");
  return `${path}?${sp.toString()}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rota: RotaErro | null;
  descricao: string;
  onRevalidar: () => void;
}

export function CorrigirPendenciaDialog({ open, onOpenChange, rota, descricao, onRevalidar }: Props) {
  if (!rota) return null;
  const url = resolveUrl(rota);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[88vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="text-base">Corrigir pendência</DialogTitle>
          <DialogDescription className="text-xs">{descricao}</DialogDescription>
          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => {
                onRevalidar();
                onOpenChange(false);
              }}
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Salvei — re-validar
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.open(url.replace(/[?&]embed=1/, ""), "_blank")}>
              <ExternalLink className="h-3 w-3 mr-1" /> Abrir em nova aba
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/20">
          <iframe key={url} src={url} title="Corrigir pendência" className="w-full h-full border-0" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
