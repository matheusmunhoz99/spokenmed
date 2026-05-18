import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, CameraOff, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
}

export default function QrScannerDialog({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        // Pede explicitamente a câmera traseira no mobile
        const constraints: MediaStreamConstraints = {
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        };
        if (cancelled) return;

        const controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current!,
          (result, _err, ctrl) => {
            if (cancelled) return;
            if (result) {
              try { navigator.vibrate?.(80); } catch { /* noop */ }
              ctrl.stop();
              onDetected(result.getText());
            }
          },
        );
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (/permission|denied|NotAllowed/i.test(msg)) {
          setError("Permita o acesso à câmera nas configurações do navegador e tente novamente.");
        } else if (/NotFound|device/i.test(msg)) {
          setError("Nenhuma câmera disponível neste dispositivo.");
        } else {
          setError("Não foi possível iniciar a câmera: " + msg);
        }
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch { /* noop */ }
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-primary" />
            Escanear QR Code
          </DialogTitle>
        </DialogHeader>

        <div className="relative aspect-square w-full bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Overlay com moldura */}
          {!error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-56 w-56">
                <span className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-emerald-400 rounded-tl-lg" />
                <span className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-emerald-400 rounded-tr-lg" />
                <span className="absolute left-0 bottom-0 h-8 w-8 border-l-4 border-b-4 border-emerald-400 rounded-bl-lg" />
                <span className="absolute right-0 bottom-0 h-8 w-8 border-r-4 border-b-4 border-emerald-400 rounded-br-lg" />
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-emerald-400/70 shadow-[0_0_12px_2px] shadow-emerald-400/60 animate-pulse" />
              </div>
            </div>
          )}

          {starting && !error && (
            <div className="absolute inset-x-0 bottom-3 text-center text-xs text-white/80">
              Iniciando câmera…
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-sm text-white">
              <CameraOff className="h-8 w-8 text-rose-400" />
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Aponte para o QR no rodapé do documento.
          </p>
          <Button variant="outline" size="sm" onClick={onClose} className="gap-1">
            <X className="h-3.5 w-3.5" /> Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
