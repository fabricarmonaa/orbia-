import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { parseScannedCode } from "@/components/addons/BarcodeListener";

type ScannerFormat = "qr" | "ean13" | "code128" | "upca" | "ean8";

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

export default function CameraScanner({ open, onClose, onCode, formats = ["qr", "ean13", "code128", "upca", "ean8"], timeoutMs = 10000 }: CameraScannerProps) {
  const { toast } = useToast();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const containerId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);

  const formatHints = useMemo(
    () => formats.map((item) => FORMAT_MAP[item]).filter(Boolean),
    [formats]
  );

  useEffect(() => {
    if (!open) return;

    let mounted = true;

    const cleanup = async () => {
      if (stoppingRef.current) return;
      stoppingRef.current = true;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      stoppingRef.current = false;
    };

    const run = async () => {
      if (!window.isSecureContext) {
        setError("El escaneo por cámara requiere HTTPS. Usá el modo Pistola/Teclado.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Tu dispositivo/navegador no soporta escaneo por cámara. Usá modo Pistola/Teclado.");
        return;
      }

      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const scanner = new Html5Qrcode(containerId, { verbose: false, formatsToSupport: formatHints.length ? formatHints : undefined });
        scannerRef.current = scanner;

        timeoutRef.current = window.setTimeout(async () => {
          toast({ title: "Tiempo de escaneo finalizado" });
          await cleanup();
          onClose();
        }, timeoutMs);

        await scanner.start(
          { facingMode: { ideal: "environment" } },
          { fps: 10, aspectRatio: 1.7778 },
          async (decodedText) => {
            const parsed = parseScannedCode(decodedText);
            if (!parsed.code) return;
            await cleanup();
            onCode(parsed.code);
            onClose();
          },
          () => {
            // ignore frame decode errors
          }
        );
      } catch (err: any) {
        const message = String(err?.message || "");
        if (message.toLowerCase().includes("permission") || message.toLowerCase().includes("denied")) {
          setError("Permiso de cámara denegado. Usá modo Pistola/Teclado.");
        } else {
          setError("No se pudo iniciar la cámara. Probá nuevamente o usá modo Pistola/Teclado.");
        }
      }
    };

    void run();

    return () => {
      mounted = false;
      void cleanup();
    };
  }, [open, containerId, formatHints, onClose, onCode, timeoutMs, toast]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escanear con cámara</DialogTitle>
          <DialogDescription>
            Apuntá al código QR o de barras. Se usará preferentemente la cámara trasera y se cerrará en {Math.ceil(timeoutMs / 1000)} segundos.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground">Sugerencia: usá “Escanear con → Pistola/Teclado”.</p>
          </div>
        ) : (
          <div id={containerId} className="w-full min-h-[220px] rounded-md border bg-black/90 overflow-hidden" />
        )}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
