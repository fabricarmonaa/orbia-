import { useEffect, useRef, useState } from "react";

type BarcodeListenerProps = {
  enabled: boolean;
  onCode: (code: string) => void;
  durationMs?: number;
};

export function parseScannedCode(raw: string): { code: string; name?: string } {
  const value = raw.trim();
  if (!value) return { code: "" };

  const gs1Match = value.match(/\(01\)(\d{8,14})/);
  if (gs1Match?.[1]) {
    const nameMatch = value.match(/\(10\)([^\(]+)/);
    return { code: gs1Match[1], name: nameMatch?.[1]?.trim() || undefined };
  }

  const ai01Match = value.match(/^01(\d{14})/);
  if (ai01Match?.[1]) return { code: ai01Match[1] };

  return { code: value };
}

export default function BarcodeListener({ enabled, onCode, durationMs = 10000 }: BarcodeListenerProps) {
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

    const flush = () => {
      if (!active) return;
      active = false;
      const code = bufferRef.current.trim();
      bufferRef.current = "";
      setRemainingMs(0);
      if (code) onCode(code);
    };

    const tickId = window.setInterval(() => {
      const next = Math.max(0, deadline - Date.now());
      setRemainingMs(next);
      if (next <= 0) flush();
    }, 100);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!active) return;
      if (event.key === "Enter") {
        event.preventDefault();
        flush();
        return;
      }
      if (event.key === "Backspace") {
        bufferRef.current = bufferRef.current.slice(0, -1);
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
    <p className="text-xs text-muted-foreground">
      Escuchando lector: {Math.ceil(remainingMs / 1000)}s (finaliza con Enter)
    </p>
  );
}
