export type TicketSize = "58mm" | "80mm" | "A4";

export interface TicketData {
  empresa: { nombre: string; logo_url?: string | null; slogan?: string | null };
  cajero: { nombre: string };
  sucursal: { nombre: string };
  venta: {
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
  items: Array<{ qty: number; name: string; unit_price: string; line_total: string }>;
}

function ticketWidth(size: TicketSize) {
  if (size === "58mm") return "58mm";
  if (size === "80mm") return "80mm";
  return "210mm";
}

export function printTicket(data: TicketData, size: TicketSize) {
  const width = ticketWidth(size);
  const date = new Date(data.venta.datetime).toLocaleString();
  const rows = data.items
    .map(
      (item) =>
        `<tr><td>${item.qty}</td><td>${item.name}</td><td style="text-align:right">${item.unit_price}</td><td style="text-align:right">${item.line_total}</td></tr>`
    )
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Ticket ${data.venta.number}</title>
<style>
body{font-family:Arial,sans-serif;padding:8px;margin:0}
.ticket{width:${width};max-width:100%;margin:0 auto}
h1,h2,p{margin:4px 0}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px dashed #ccc;padding:4px 2px;vertical-align:top}
.totals{margin-top:8px;font-size:12px}.right{text-align:right}
@media print{@page{size:auto;margin:6mm} body{padding:0}}
</style></head>
<body><div class="ticket">
${data.empresa.logo_url ? `<img src="${data.empresa.logo_url}" style="max-height:56px;max-width:100%;display:block;margin:0 auto 6px;" />` : ""}
<h2 style="text-align:center">${data.empresa.nombre}</h2>
<p style="text-align:center">${data.empresa.slogan || ""}</p>
<p><strong>Venta:</strong> ${data.venta.number}</p>
<p><strong>Fecha:</strong> ${date}</p>
<p><strong>Sucursal:</strong> ${data.sucursal.nombre}</p>
<p><strong>CAJERO:</strong> ${data.cajero.nombre}</p>
<p><strong>Pago:</strong> ${data.venta.payment}</p>
<table><thead><tr><th>Cant</th><th>Producto</th><th>P.Unit</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
<p class="right">Subtotal: ${data.venta.subtotal}</p>
<p class="right">Descuento: ${data.venta.discount}</p>
<p class="right">Recargo: ${data.venta.surcharge}</p>
<p class="right"><strong>Total: ${data.venta.total}</strong></p>
</div>
${data.venta.notes ? `<p><strong>Notas:</strong> ${data.venta.notes}</p>` : ""}
<p style="text-align:center;margin-top:12px">Gracias por su compra</p>
</div></body></html>`;

  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
