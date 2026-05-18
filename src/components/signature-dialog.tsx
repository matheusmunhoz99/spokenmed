import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/signature-pad";
import { Check } from "lucide-react";
import { toast } from "sonner";

export type SignatureResult =
  | { assinatura: string; recusou: false; motivoRecusa: null }
  | { assinatura: null; recusou: true; motivoRecusa: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  description?: string;
  onConfirm: (result: SignatureResult) => void;
  allowRefusal?: boolean;
};

export function SignatureDialog({
  open,
  onOpenChange,
  title = "Assinatura do paciente",
  description = "Peça ao paciente ou responsável para assinar abaixo e toque em OK para salvar.",
  onConfirm,
  allowRefusal = true,
}: Props) {
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [recusou, setRecusou] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState("");

  useEffect(() => {
    if (open) {
      setAssinatura(null);
      setRecusou(false);
      setMotivoRecusa("");
    }
  }, [open]);

  const handleOk = () => {
    if (recusou) {
      if (!motivoRecusa.trim()) {
        toast.error("Informe o motivo da recusa.");
        return;
      }
      onConfirm({ assinatura: null, recusou: true, motivoRecusa: motivoRecusa.trim() });
      return;
    }
    if (!assinatura) {
      toast.error("Confirme a assinatura antes de prosseguir.");
      return;
    }
    onConfirm({ assinatura, recusou: false, motivoRecusa: null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4 sm:p-6 max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        {!recusou && (
          <div className="space-y-2">
            <SignaturePad value={assinatura} onChange={setAssinatura} height={170} />
            <p className="text-[11px] text-muted-foreground">
              Desenhe e toque em <strong>Confirmar assinatura</strong>, depois em <strong>OK</strong>.
            </p>
          </div>
        )}

        {allowRefusal && (
          <div className="mt-2 space-y-2 border-t pt-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={recusou}
                onCheckedChange={(v) => {
                  setRecusou(!!v);
                  if (v) setAssinatura(null);
                }}
              />
              <span>Paciente recusou / impossibilitado de assinar</span>
            </label>
            {recusou && (
              <Input
                placeholder="Motivo da recusa / impossibilidade"
                value={motivoRecusa}
                onChange={(e) => setMotivoRecusa(e.target.value)}
              />
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleOk} className="flex-1">
            <Check className="mr-1 h-4 w-4" /> OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
