import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import QRCode from "qrcode";
import { renderToStaticMarkup } from "react-dom/server";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketLayout from "@/components/print/TicketLayout";

export default function OrderPrintPage() {
  const [location] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [html, setHtml] = useState("");

  const orderId = useMemo(() => {
    const match = location.match(/\/app\/print\/order\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [location]);

  useEffect(() => {
    if (!orderId) {
      setError("ID de pedido inválido.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/orders/${orderId}/print-data`);
        const json = await res.json();
        if (!res.ok || !json?.data) throw new Error(json?.error || "No se pudo cargar ticket");
        const d = json.data;
        const qrImage = d.qr?.publicUrl ? await QRCode.toDataURL(d.qr.publicUrl, { margin: 1, width: 160 }) : null;
        const markup = renderToStaticMarkup(
          <TicketLayout
            mode="TICKET_80"
            variant="ORDER"
            data={{
              tenant: { name: d.tenant?.name || "Negocio", logoUrl: d.tenant?.logoUrl || null },
              order: {
                number: d.order.number,
                createdAt: d.order.createdAt,
                status: d.order.status,
                customerName: d.order.customerName,
                description: d.order.description,
                totalAmount: d.order.totalAmount,
              },
              totals: { total: d.order.totalAmount || "-" },
              items: [{ qty: 1, name: d.order.type || "Pedido", subtotal: d.order.totalAmount || "-" }],
              qr: { publicUrl: d.qr?.publicUrl, imageDataUrl: qrImage },
            }}
          />
        );
        setHtml(markup);
        setTimeout(() => window.print(), 250);
      } catch (e: any) {
        setError(e?.message || "No se pudo cargar ticket");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando ticket...</div>;
  }

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
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-end">
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
