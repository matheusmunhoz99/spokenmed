import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check } from "lucide-react";

type Props = {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  height?: number;
};

export function SignaturePad({ value, onChange, disabled, height = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState<boolean>(!!value);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
  }, [value]);

  useEffect(() => {
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resize]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handleDown = (e: React.PointerEvent) => {
    if (disabled) return;
    drawing.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const handleMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };
  const handleUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
  };

  const handleClear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange(null);
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onChange(dataUrl);
  };

  return (
    <div className="space-y-2">
      <div
        className="rounded-md border-2 border-dashed bg-white"
        style={{ height, touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full rounded-md"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          onPointerCancel={handleUp}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={handleClear} disabled={disabled}>
          <Eraser className="mr-1 h-4 w-4" /> Limpar
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={disabled || !hasInk}>
          <Check className="mr-1 h-4 w-4" /> Confirmar assinatura
        </Button>
        {value && <span className="text-xs text-emerald-600 self-center">Assinatura confirmada</span>}
      </div>
    </div>
  );
}
