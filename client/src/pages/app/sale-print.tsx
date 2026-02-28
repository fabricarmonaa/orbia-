import { useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function SalePrintPage() {
  const [location] = useLocation();

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
        <Button asChild variant="outline"><a href={pdfUrl} target="_blank" rel="noreferrer">Abrir PDF</a></Button>
      </div>
      <iframe title="ticket-pdf" src={pdfUrl} className="w-full h-[92vh] border-0 bg-white" />
    </div>
  );
}
