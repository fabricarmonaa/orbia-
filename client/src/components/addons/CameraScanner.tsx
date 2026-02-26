import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseScannedCode } from "@/components/addons/BarcodeListener";

type ScannerFormat = "qr" | "ean13" | "code128" | "upca" | "ean8";
type ScannerStatus = "idle" | "requesting_permission" | "ready" | "error";

type CameraScannerProps = {
  open: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
  formats?: ScannerFormat[];
  timeoutMs?: number;
};

const FORMAT_MAP: Record<ScannerFormat, Html5QrcodeSupportedFormats> = {
  qr: Html5QrcodeSupportedFormats.QR_CODE,
  ean13: Html5QrcodeSupportedFormats.EAN_13,
  code128: Html5QrcodeSupportedFormats.CODE_128,
  upca: Html5QrcodeSupportedFormats.UPC_A,
  ean8: Html5QrcodeSupportedFormats.EAN_8,
};

function devLog(event: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.debug(`[camera-scanner] ${event}`, data || {});
}

function classifyCameraError(err: any) {
  const name = String(err?.name || "");
  if (name === "NotAllowedError" || name === "SecurityError") return "Permiso de cámara denegado. Revisá permisos del navegador.";
  if (name === "NotFoundError") return "No se encontró ninguna cámara en este dispositivo.";
  if (name === "NotReadableError") return "La cámara está siendo usada por otra app/pestaña.";
  if (name === "OverconstrainedError") return "No se pudo usar la cámara trasera. Probá cambiar cámara.";
  return "No se pudo abrir la cámara. Probá nuevamente.";
}

export default function CameraScanner({ open, onClose, onCode, formats = ["qr", "ean13", "code128", "upca", "ean8"], timeoutMs = 10000 }: CameraScannerProps) {
  const { toast } = useToast();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const closingRef = useRef(false);
  const mountedRef = useRef(true);
  const lastReadRef = useRef<{ code: string; at: number } | null>(null);

  const containerId = useId().replace(/:/g, "");
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [cameraOptions, setCameraOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [retryNonce, setRetryNonce] = useState(0);

  const formatHints = useMemo(() => formats.map((item) => FORMAT_MAP[item]).filter(Boolean), [formats.join("|")]);

  const stopScanner = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) {
          await scannerRef.current.stop();
        }
      } catch {
        // noop
      }
      try {
        await scannerRef.current.clear();
      } catch {
        // noop
      }
      scannerRef.current = null;
    }
    closingRef.current = false;
  }, []);

  const chooseBackCamera = useCallback((devices: MediaDeviceInfo[]) => {
    const videos = devices.filter((d) => d.kind === "videoinput");
    const withScore = videos.map((d) => {
      const label = d.label.toLowerCase();
      const score = /(back|rear|environment|trasera|traseira)/.test(label) ? 10 : 0;
      return { id: d.deviceId, label: d.label || "Cámara", score };
    });
    withScore.sort((a, b) => b.score - a.score);
    return withScore;
  }, []);

  const startScanner = useCallback(async () => {
    if (!open || startingRef.current || !mountedRef.current) return;
    startingRef.current = true;
    setError(null);
    setStatus("requesting_permission");

    try {
      if (!window.isSecureContext) {
        setStatus("error");
        setError("El escaneo por cámara requiere HTTPS o PWA segura.");
        return;
      }

      const scanner = new Html5Qrcode(containerId, {
        verbose: false,
        formatsToSupport: formatHints.length ? formatHints : undefined,
      });
      scannerRef.current = scanner;

      const onSuccess = async (decodedText: string) => {
        const parsed = parseScannedCode(decodedText);
        const clean = parsed.code.trim();
        if (!clean) return;

        const now = Date.now();
        if (lastReadRef.current && lastReadRef.current.code === clean && now - lastReadRef.current.at < 1500) {
          return;
        }
        lastReadRef.current = { code: clean, at: now };

        try {
          navigator.vibrate?.(50);
        } catch {
          // noop
        }

        await stopScanner();
        onCode(clean);
        onClose();
      };

      const onFailure = () => {
        // ignore frame failures
      };

      const startConfig = { fps: 8, qrbox: { width: 260, height: 160 }, aspectRatio: 1.7778 };

      try {
        await scanner.start(cameraId || { facingMode: { ideal: "environment" } }, startConfig, onSuccess, onFailure);
      } catch (firstErr) {
        devLog("primary_start_failed", { err: String((firstErr as any)?.message || firstErr) });
        const devices = await Html5Qrcode.getCameras().catch(() => [] as Array<{ id: string; label: string }>);
        if (devices.length > 0) {
          const mapped = devices.map((d: { id: string; label: string }) => ({ id: d.id, label: d.label || "Cámara" }));
          setCameraOptions(mapped);
          const rear = mapped.find((d: { id: string; label: string }) => /(back|rear|environment|trasera|traseira)/i.test(d.label));
          if (rear) {
            setCameraId(rear.id);
            await scanner.start(rear.id, startConfig, onSuccess, onFailure);
          } else {
            await scanner.start(mapped[0].id, startConfig, onSuccess, onFailure);
          }
        } else {
          await scanner.start({ facingMode: "environment" } as any, startConfig, onSuccess, onFailure);
        }
      }

      const cams = await Html5Qrcode.getCameras().catch(() => [] as Array<{ id: string; label: string }>);
      const mapped = cams.map((d: { id: string; label: string }) => ({ id: d.id, label: d.label || "Cámara" }));
      if (mapped.length > 0) {
        setCameraOptions(mapped);
        if (!cameraId) {
          const rear = mapped.find((d: { id: string; label: string }) => /(back|rear|environment|trasera|traseira)/i.test(d.label));
          setCameraId((rear || mapped[0]).id);
        }
      }

      setStatus("ready");
      timeoutRef.current = window.setTimeout(async () => {
        toast({ title: "Tiempo de escaneo finalizado" });
        await stopScanner();
        onClose();
      }, timeoutMs);
      devLog("started", { cameraId });
    } catch (err: any) {
      devLog("start_error", { name: err?.name, message: err?.message });
      setStatus("error");
      setError(classifyCameraError(err));
      await stopScanner();
    } finally {
      startingRef.current = false;
    }
  }, [open, containerId, formatHints, cameraId, onClose, onCode, timeoutMs, toast, stopScanner]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    void startScanner();
    return () => {
      void stopScanner();
      setStatus("idle");
    };
  }, [open, retryNonce, startScanner, stopScanner]);

  const handleRetry = async () => {
    await stopScanner();
    setRetryNonce((n) => n + 1);
  };

  const handleSwitchCamera = async () => {
    if (cameraOptions.length < 2) return;
    const idx = cameraOptions.findIndex((c) => c.id === cameraId);
    const next = cameraOptions[(idx + 1) % cameraOptions.length];
    setCameraId(next.id);
    await stopScanner();
    setRetryNonce((n) => n + 1);
  };

  const submitManual = async () => {
    const parsed = parseScannedCode(manualCode);
    if (!parsed.code) return;
    await stopScanner();
    onCode(parsed.code);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escanear con cámara</DialogTitle>
          <DialogDescription>
            {status === "requesting_permission" && "Solicitando permisos de cámara..."}
            {status === "ready" && "Apuntá al código QR o de barras."}
            {status === "error" && "No se pudo abrir la cámara."}
            {status === "idle" && `Se cerrará en ${Math.ceil(timeoutMs / 1000)} segundos.`}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={handleRetry}>Reintentar</Button>
          </div>
        ) : (
          <div id={containerId} className="w-full min-h-[240px] rounded-md border bg-black/90 overflow-hidden" />
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Ingreso manual (fallback)</p>
          <div className="flex gap-2">
            <Input value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="Ingresar código" />
            <Button type="button" variant="secondary" onClick={submitManual}>Usar</Button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleSwitchCamera} disabled={cameraOptions.length < 2}>Cambiar cámara</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
