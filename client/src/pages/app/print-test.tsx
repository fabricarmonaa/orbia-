import { TicketLayout } from "@/components/print/TicketLayout";
import { Button } from "@/components/ui/button";

const fake = {
  tenant: { name: "ORBIA DEMO", slogan: "Ticket demo" },
  branch: { name: "Sucursal Centro" },
  cashier: { name: "Caja 1" },
  sale: { number: "V-000123", createdAt: new Date().toISOString(), paymentMethod: "EFECTIVO", notes: "Sin TACC" },
  totals: { subtotal: "$ 42.500", discount: "$ 1.000", surcharge: "$ 0", total: "$ 41.500", currency: "ARS" },
  items: [
    { qty: 2, name: "Coca Cola 500ml Botella retornable", unitPrice: "$ 2.500", subtotal: "$ 5.000" },
    { qty: 1, name: "Hamburguesa completa con queso y panceta", unitPrice: "$ 12.500", subtotal: "$ 12.500" },
    { qty: 3, name: "Papas fritas grandes", unitPrice: "$ 8.000", subtotal: "$ 24.000" },
  ],
  qr: { publicUrl: "https://app.orbiapanel.com/t/demo/track/abc123" },
};

export default function PrintTestPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Print Test 58/80/A4</h1>
        <Button onClick={() => window.print()}>Imprimir prueba</Button>
      </div>
      <div className="grid gap-6">
        <TicketLayout mode="TICKET_58" variant="SALE" data={fake} />
        <TicketLayout mode="TICKET_80" variant="SALE" data={fake} />
        <TicketLayout mode="A4" variant="SALE" data={fake} />
      </div>
    </div>
  );
}
