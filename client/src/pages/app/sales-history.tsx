import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { printTicket, type TicketData, type TicketSize } from "@/components/sales/ticket-print";

interface SaleListItem {
  id: number;
  saleNumber: string;
  saleDatetime: string;
  totalAmount: string;
  paymentMethod: string;
}

export default function SalesHistoryPage() {
  const [data, setData] = useState<SaleListItem[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [ticketSize, setTicketSize] = useState<TicketSize>("80mm");

  async function load() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q) params.set("q", q);
    const res = await apiRequest("GET", `/api/sales?${params.toString()}`);
    const json = await res.json();
    setData(json.data || []);
  }

  async function reprint(saleId: number) {
    const res = await apiRequest("POST", `/api/sales/${saleId}/print-data`);
    const json = await res.json();
    printTicket(json.data as TicketData, ticketSize);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle>Historial de Ventas</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label>Búsqueda</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° venta" /></div>
          <div>
            <Label>Tamaño ticket</Label>
            <Select value={ticketSize} onValueChange={(v: TicketSize) => setTicketSize(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm">58mm</SelectItem>
                <SelectItem value="80mm">80mm</SelectItem>
                <SelectItem value="A4">A4</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={load}>Filtrar</Button>

        <div className="space-y-2">
          {data.map((row) => (
            <div key={row.id} className="border rounded p-2 flex justify-between items-center">
              <div>
                <p className="font-medium">{row.saleNumber}</p>
                <p className="text-xs text-muted-foreground">{new Date(row.saleDatetime).toLocaleString()} · {row.paymentMethod}</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{row.totalAmount}</p>
                <Button variant="outline" onClick={() => reprint(row.id)}>Reimprimir</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
