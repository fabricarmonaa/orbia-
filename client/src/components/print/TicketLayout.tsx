import React from "react";

export type PrintMode = "TICKET_58" | "TICKET_80" | "A4";
export type PrintVariant = "SALE" | "ORDER" | "KITCHEN";

export interface UnifiedPrintData {
  tenant: { name: string; logoUrl?: string | null; slogan?: string | null };
  branch?: { name?: string | null } | null;
  cashier?: { name?: string | null } | null;
  sale?: { number: string; createdAt: string; paymentMethod?: string; notes?: string | null };
  order?: { number: string | number; createdAt: string; status?: string; customerName?: string | null; description?: string | null; totalAmount?: string | null };
  totals?: { subtotal?: string; discount?: string; surcharge?: string; total?: string; currency?: string };
  items?: Array<{ qty: number; name: string; code?: string | null; unitPrice?: string; subtotal?: string }>;
  qr?: { publicUrl?: string | null; imageDataUrl?: string | null };
}

function widths(mode: PrintMode) {
  if (mode === "TICKET_58") return { width: "58mm", page: "58mm auto", qr: 90 };
  if (mode === "TICKET_80") return { width: "80mm", page: "80mm auto", qr: 110 };
  return { width: "210mm", page: "A4", qr: 140 };
}

export function TicketLayout({ mode, data, variant }: { mode: PrintMode; data: UnifiedPrintData; variant: PrintVariant }) {
  const w = widths(mode);
  const date = new Date((data.sale?.createdAt || data.order?.createdAt || new Date().toISOString())).toLocaleString();
  const showPrices = variant !== "KITCHEN";

  return (
    <div className="ticket-layout" style={{ width: w.width, maxWidth: "100%", margin: "0 auto", padding: mode === "A4" ? "14mm" : "3mm", fontFamily: "Inter, ui-monospace, monospace", fontSize: mode === "A4" ? 13 : 11, lineHeight: 1.3 }}>
      <style>{`@media print { @page { size: ${w.page}; margin: ${mode === "A4" ? "10mm" : "0"}; } .print-hide { display:none !important; } }`}</style>
      <div style={{ textAlign: "center" }}>
        {data.tenant.logoUrl ? <img src={data.tenant.logoUrl} style={{ maxHeight: mode === "A4" ? 70 : 45, margin: "0 auto 6px" }} /> : null}
        <div style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>{data.tenant.name}</div>
        {data.tenant.slogan ? <div style={{ opacity: 0.8 }}>{data.tenant.slogan}</div> : null}
      </div>
      <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
      <div><b>{variant === "SALE" ? "Ticket" : variant === "KITCHEN" ? "Comanda" : "Pedido"}:</b> {data.sale?.number || data.order?.number}</div>
      <div><b>Fecha:</b> {date}</div>
      {data.branch?.name ? <div><b>Sucursal:</b> {data.branch.name}</div> : null}
      {data.cashier?.name ? <div><b>Cajero:</b> {data.cashier.name}</div> : null}
      {data.sale?.paymentMethod ? <div><b>Pago:</b> {data.sale.paymentMethod}</div> : null}
      {data.order?.status ? <div><b>Estado:</b> {data.order.status}</div> : null}
      <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />

      <div>
        {(data.items || []).map((item, idx) => (
          <div key={idx} style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{item.qty} x {item.name}</span>
              {showPrices ? <span>{item.subtotal || ""}</span> : null}
            </div>
            {showPrices ? <div style={{ opacity: 0.75 }}>{item.unitPrice || ""}</div> : null}
          </div>
        ))}
      </div>

      {showPrices ? (
        <>
          <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
          <div style={{ textAlign: "right" }}>Subtotal: {data.totals?.subtotal || "-"}</div>
          <div style={{ textAlign: "right" }}>Descuento: {data.totals?.discount || "-"}</div>
          <div style={{ textAlign: "right" }}>Recargo: {data.totals?.surcharge || "-"}</div>
          <div style={{ textAlign: "right", fontWeight: 900, fontSize: mode === "A4" ? 20 : 14 }}>TOTAL: {data.totals?.total || data.order?.totalAmount || "-"}</div>
        </>
      ) : null}

      {data.qr?.imageDataUrl && variant !== "KITCHEN" ? (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <img src={data.qr.imageDataUrl} style={{ width: w.qr, height: w.qr, margin: "0 auto" }} />
          <div style={{ fontSize: mode === "A4" ? 12 : 10 }}>Escaneá para seguimiento/comprobante</div>
          {data.qr.publicUrl ? <div style={{ opacity: 0.75, wordBreak: "break-all" }}>{data.qr.publicUrl}</div> : null}
        </div>
      ) : null}

      {data.sale?.notes || data.order?.description ? <div style={{ marginTop: 6 }}><b>Notas:</b> {data.sale?.notes || data.order?.description}</div> : null}
      <div style={{ textAlign: "center", marginTop: 10 }}>Gracias por su compra</div>
    </div>
  );
}

export default TicketLayout;
