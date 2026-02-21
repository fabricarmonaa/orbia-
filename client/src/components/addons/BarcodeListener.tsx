import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type BarcodeListenerProps = {
  enabled: boolean;
  onCode: (code: string) => void;
  durationMs?: number;
  onCancel?: () => void;
  allowTimeoutEmit?: boolean;
};

export function parseScannedCode(raw: string): { code: string } {
  const value = raw.trim().replace(/\s+/g, "").replace(/^\]C1/i, "");
  if (!value) return { code: "" };
  return { code: value };
}

export default function BarcodeListener({ enabled, onCode, durationMs = 10000, onCancel, allowTimeoutEmit = false }: BarcodeListenerProps) {
  const [remainingMs, setRemainingMs] = useState(0);
  const bufferRef = useRef("");

  useEffect(() => {
    if (!enabled) {
      setRemainingMs(0);
      bufferRef.current = "";
      return;
    }

    const deadline = Date.now() + durationMs;
    setRemainingMs(durationMs);
    bufferRef.current = "";

    let active = true;

    const stop = (reason: "enter" | "timeout" | "escape") => {
      if (!active) return;
      active = false;
      const code = bufferRef.current.trim();
      bufferRef.current = "";
      setRemainingMs(0);

      if (reason === "enter") {
        if (code) onCode(code);
        return;
      }

      if (reason === "timeout" && allowTimeoutEmit && code) {
        onCode(code);
        return;
      }

      onCancel?.();
    };

    const tickId = window.setInterval(() => {
      const next = Math.max(0, deadline - Date.now());
      setRemainingMs(next);
      if (next <= 0) stop("timeout");
    }, 100);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!active) return;
      if (event.key === "Enter") {
        event.preventDefault();
        stop("enter");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        stop("escape");
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        bufferRef.current += event.key;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      active = false;
      window.clearInterval(tickId);
      window.removeEventListener("keydown", onKeyDown, true);
      bufferRef.current = "";
      setRemainingMs(0);
    };
  }, [enabled, durationMs, onCode]);

  if (!enabled || remainingMs <= 0) return null;

  return (
    <Dialog open={enabled}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escaneando... ({Math.ceil(remainingMs / 1000)}s)</DialogTitle>
          <DialogDescription>
            Modo lector: Pistola/Teclado · Entrada: Capturar escaneo (recomendado). Apuntá y escaneá el producto. Se cerrará en 10 segundos.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Finalizá con Enter o cancelá con Escape.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => onCancel?.()}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
