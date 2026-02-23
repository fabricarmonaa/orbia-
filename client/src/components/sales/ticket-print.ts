import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QRCode from "qrcode";
import { TicketLayout, type PrintMode, type UnifiedPrintData } from "@/components/print/TicketLayout";

export type TicketSize = "58mm" | "80mm" | "A4";

export interface TicketData {
  tenant?: { name: string; logoUrl?: string | null; slogan?: string | null };
  branch?: { name?: string | null } | null;
  cashier?: { name?: string | null } | null;
  sale?: { number: string; createdAt: string; paymentMethod?: string; notes?: string | null };
  totals?: { subtotal?: string; discount?: string; surcharge?: string; total?: string; currency?: string };
  items?: Array<{ qty: number; name: string; code?: string | null; unitPrice?: string; subtotal?: string }>;
  qr?: { publicUrl?: string | null };
  // legacy
  empresa?: { nombre: string; logo_url?: string | null; slogan?: string | null };
  cajero?: { nombre: string };
  sucursal?: { nombre: string };
  venta?: {
    number: string;
    datetime: string;
    payment: string;
    subtotal: string;
    discount: string;
    surcharge: string;
    total: string;
    notes?: string | null;
    currency: string;
  };
  items_legacy?: Array<{ qty: number; name: string; sku?: string | null; unit_price: string; line_total: string }>;
}

function toMode(size: TicketSize): PrintMode {
  if (size === "58mm") return "TICKET_58";
  if (size === "80mm") return "TICKET_80";
  return "A4";
}

function normalize(data: TicketData): UnifiedPrintData {
  if (data.tenant && data.sale) {
    return {
      tenant: data.tenant,
      branch: data.branch,
      cashier: data.cashier,
      sale: data.sale,
      totals: data.totals,
      items: data.items,
      qr: data.qr,
    };
  }

  return {
    tenant: { name: data.empresa?.nombre || "Negocio", logoUrl: data.empresa?.logo_url, slogan: data.empresa?.slogan || null },
    branch: { name: data.sucursal?.nombre || null },
    cashier: { name: data.cajero?.nombre || null },
    sale: data.venta ? { number: data.venta.number, createdAt: data.venta.datetime, paymentMethod: data.venta.payment, notes: data.venta.notes } : undefined,
    totals: data.venta
      ? { subtotal: data.venta.subtotal, discount: data.venta.discount, surcharge: data.venta.surcharge, total: data.venta.total, currency: data.venta.currency }
      : undefined,
    items: (data.items_legacy || []).map((i) => ({ qty: i.qty, name: i.name, code: i.sku, unitPrice: i.unit_price, subtotal: i.line_total })),
    qr: data.qr,
  };
}

export async function printTicket(data: TicketData, size: TicketSize) {
  const mode = toMode(size);
  const normalized = normalize(data);
  let qrImage: string | null = null;
  if (normalized.qr?.publicUrl) {
    qrImage = await QRCode.toDataURL(normalized.qr.publicUrl, { margin: 1, width: mode === "A4" ? 220 : mode === "TICKET_80" ? 160 : 140 });
  }

  const html = renderToStaticMarkup(
    React.createElement(TicketLayout, {
      mode,
      variant: "SALE",
      data: {
        ...normalized,
        qr: { ...(normalized.qr || {}), imageDataUrl: qrImage },
      },
    })
  );

  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset=\"utf-8\" /><title>Ticket</title></head><body>${html}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
