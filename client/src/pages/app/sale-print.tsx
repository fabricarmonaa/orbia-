import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth";

export default function SalePrintPage() {
  const [location] = useLocation();
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saleId = useMemo(() => {
    const match = location.match(/\/app\/print\/sale\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [location]);

  const mode = useMemo(() => {
    const value = new URLSearchParams(location.split("?")[1] || "").get("mode");
    if (value === "TICKET_58" || value === "TICKET_80") return value;
    return "TICKET_80";
  }, [location]);

  const width = mode === "TICKET_58" ? "58" : "80";
  const pdfUrl = saleId ? `/api/sales/${saleId}/ticket-pdf?width=${width}` : null;

  useEffect(() => {
    if (!pdfUrl) return;
    let active = true;
    let localUrl: string | null = null;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await apiRequest("GET", pdfUrl);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || "No se pudo generar el PDF del ticket.");
        }
        const blob = await res.blob();
        localUrl = URL.createObjectURL(blob);
        if (active) {
          setPdfBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return localUrl;
          });
        }
      } catch (err: any) {
        if (active) setError(err?.message || "No se pudo generar el PDF del ticket.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [pdfUrl]);

  function isPrintMode(value: string): value is "TICKET_58" | "TICKET_80" {
    return value === "TICKET_58" || value === "TICKET_80";
  }

  function setPrintMode(nextMode: "TICKET_58" | "TICKET_80") {
    const params = new URLSearchParams(location.split("?")[1] || "");
    params.set("mode", nextMode);
    window.location.replace(`/app/print/sale/${saleId}?${params.toString()}`);
  }

  if (!saleId || !pdfUrl) return <div className="p-6 text-sm text-muted-foreground">ID de venta inválido.</div>;

  return (
    <div className="p-2 space-y-2 print-page-shell bg-white min-h-screen">
      <div className="flex items-center justify-end gap-2 print-hide">
        <select value={mode} onChange={(e) => { const value = e.target.value; if (isPrintMode(value)) setPrintMode(value); }} className="border rounded px-2 py-1 text-sm">
          <option value="TICKET_58">Ticket 57/58mm</option>
          <option value="TICKET_80">Ticket 80mm</option>
        </select>
        <Button asChild variant="outline" disabled={!pdfBlobUrl}>
          <a href={pdfBlobUrl || "#"} target="_blank" rel="noreferrer">Abrir PDF</a>
        </Button>
      </div>
      {loading && <div className="text-sm text-muted-foreground p-4">Generando PDF...</div>}
      {error && <div className="text-sm text-destructive p-4">{error}</div>}
      {!loading && !error && pdfBlobUrl && <iframe title="ticket-pdf" src={pdfBlobUrl} className="w-full h-[92vh] border-0 bg-white" />}
    </div>
  );
}
