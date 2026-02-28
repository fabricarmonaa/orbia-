import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import QRCode from "qrcode";
import { renderToStaticMarkup } from "react-dom/server";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketLayout from "@/components/print/TicketLayout";
import type { PrintMode } from "@/components/print/TicketLayout";

export default function SalePrintPage() {
  const [location] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [html, setHtml] = useState("");

  const saleId = useMemo(() => {
    const match = location.match(/\/app\/print\/sale\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [location]);

  const autoprint = useMemo(() => {
    return new URLSearchParams(location.split("?")[1] || "").get("autoprint") === "1";
  }, [location]);

  const mode = useMemo<PrintMode>(() => {
    const value = new URLSearchParams(location.split("?")[1] || "").get("mode");
    if (value === "TICKET_58" || value === "TICKET_80" || value === "A4") return value;
    return "TICKET_80";
  }, [location]);

  useEffect(() => {
    if (!saleId) {
      setError("ID de venta inválido.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await apiRequest("GET", `/api/sales/${saleId}/print-data`);
        const json = await res.json();
        if (!res.ok || !json?.data) throw new Error(json?.error || "No se pudo cargar ticket");

        const d = json.data;
        const qrImage = d.qr?.publicUrl ? await QRCode.toDataURL(d.qr.publicUrl, { margin: 1, width: 160 }) : null;
        const markup = renderToStaticMarkup(
          <TicketLayout
            mode={mode}
            variant="SALE"
            data={{
              tenant: { name: d.business?.name || d.tenant?.name || "Negocio", logoUrl: d.business?.logoUrl || d.tenant?.logoUrl || null },
              branch: d.branch || null,
              sale: {
                number: d.sale.number,
                createdAt: d.sale.createdAt,
                paymentMethod: d.sale.paymentMethod,
                notes: d.sale.notes,
                customerName: d.sale.customerName,
                customerDni: d.sale.customerDni,
                customerPhone: d.sale.customerPhone,
              },
              totals: { subtotal: d.sale.subtotal, discount: d.sale.discount, surcharge: d.sale.surcharge, total: d.sale.total, currency: d.sale.currency },
              items: (d.items || []).map((item: any) => ({ qty: item.qty, name: item.name, code: item.code, unitPrice: item.unitPrice, subtotal: item.total })),
              qr: { publicUrl: d.qr?.publicUrl, imageDataUrl: qrImage },
            }}
          />
        );
        setHtml(markup);
        if (autoprint) setTimeout(() => window.print(), 250);
      } catch (e: any) {
        setError(e?.message || "No se pudo cargar ticket");
      } finally {
        setLoading(false);
      }
    })();
  }, [saleId, autoprint, mode]);

  function setPrintMode(nextMode: PrintMode) {
    const params = new URLSearchParams(location.split("?")[1] || "");
    params.set("mode", nextMode);
    if (autoprint) params.set("autoprint", "1");
    window.location.replace(`/app/print/sale/${saleId}?${params.toString()}`);
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Cargando ticket...</div>;

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader><CardTitle>Error al cargar ticket</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => window.location.reload()}>Reintentar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 print-page-shell">
      <div className="flex items-center justify-end gap-2 print-hide">
        <select value={mode} onChange={(e) => setPrintMode(e.target.value as PrintMode)} className="border rounded px-2 py-1 text-sm">
          <option value="TICKET_58">Ticket 57/58mm</option>
          <option value="TICKET_80">Ticket 80mm</option>
          <option value="A4">A4</option>
        </select>
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
