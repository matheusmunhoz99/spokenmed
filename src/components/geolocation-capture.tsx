import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

export type GeoCoord = {
  latitude: number;
  longitude: number;
  accuracy: number;
  captured_at: string;
};

type Props = {
  value: GeoCoord | null;
  onChange: (v: GeoCoord | null) => void;
  required?: boolean;
};

export function GeolocationCapture({ value, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = () => {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Geolocalização não suportada neste dispositivo.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          captured_at: new Date().toISOString(),
        });
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Permissão de localização negada. Habilite o GPS para registrar a visita.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Localização indisponível. Verifique o sinal do GPS.");
        } else if (err.code === err.TIMEOUT) {
          setError("Tempo esgotado ao obter a localização. Tente novamente.");
        } else {
          setError("Não foi possível obter a localização.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2 text-emerald-700 font-medium">
            <MapPin className="h-4 w-4" /> Localização capturada
          </div>
          <div className="mt-1 grid gap-0.5 text-xs text-muted-foreground tabular-nums">
            <div>Lat: {value.latitude.toFixed(6)}</div>
            <div>Lng: {value.longitude.toFixed(6)}</div>
            <div>Precisão: ±{Math.round(value.accuracy)} m</div>
          </div>
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={capture} disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Recapturar
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={capture} disabled={loading} variant="secondary" className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
          Capturar localização (GPS)
        </Button>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
