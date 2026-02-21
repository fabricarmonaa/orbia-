import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SaleRow = {
  id: number;
  number: string;
  createdAt: string;
  customer: { id?: number; name?: string | null; dni?: string | null; phone?: string | null } | null;
  paymentMethod?: string | null;
  subtotal: string;
  discount: string;
  surcharge: string;
  total: string;
  branch: { id?: number | null; name?: string | null } | null;
};

type SaleDetail = {
  sale: {
    id: number;
    saleNumber: string;
    saleDatetime: string;
    subtotalAmount: string;
    discountAmount: string;
    surchargeAmount: string;
    totalAmount: string;
    paymentMethod: string;
    notes?: string | null;
  };
  items: Array<{ id: number; productNameSnapshot: string; quantity: number; unitPrice: string; lineTotal: string }>;
  customer: { id: number; name: string; doc?: string | null; phone?: string | null } | null;
};

const defaultLimit = 50;

export default function SalesHistoryPage() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [meta, setMeta] = useState({ limit: defaultLimit, offset: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [number, setNumber] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<SaleDetail | null>(null);

  const canPrev = meta.offset > 0;
  const canNext = meta.offset + meta.limit < meta.total;

  async function load(nextOffset = 0) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (number.trim()) params.set("number", number.trim());
      if (customerQuery.trim()) params.set("customerQuery", customerQuery.trim());
      params.set("limit", String(meta.limit || defaultLimit));
      params.set("offset", String(Math.max(0, nextOffset)));
      params.set("sort", "date_desc");

      const res = await apiRequest("GET", `/api/sales?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cargar historial de ventas");
      setRows(json?.data || []);
      setMeta({
        limit: Number(json?.meta?.limit || defaultLimit),
        offset: Number(json?.meta?.offset || 0),
        total: Number(json?.meta?.total || 0),
      });
    } catch (err: any) {
      setRows([]);
      setError(err?.message || "No se pudo cargar historial de ventas");
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(saleId: number) {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await apiRequest("GET", `/api/sales/${saleId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cargar detalle");
      setDetail(json?.data || null);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function printSale(saleId: number) {
    const url = `/app/print/sale/${saleId}`;
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) window.location.href = url;
  }

  useEffect(() => {
    void load(0);
  }, []);

  const totalLabel = useMemo(() => `$${Number(rows.reduce((acc, row) => acc + Number(row.total || 0), 0)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>N° Venta</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Ej: V-000123" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Cliente</Label>
            <Input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Nombre, DNI o teléfono" />
          </div>
          <div className="md:col-span-5 flex gap-2">
            <Button onClick={() => void load(0)} disabled={loading}>Aplicar</Button>
            <Button
              variant="outline"
              onClick={() => {
                setFrom("");
                setTo("");
                setNumber("");
                setCustomerQuery("");
                void load(0);
              }}
              disabled={loading}
            >
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resultados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {loading ? <p className="text-sm text-muted-foreground">Cargando ventas...</p> : null}

          {!loading && rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay ventas para los filtros seleccionados.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2">Fecha</th>
                    <th className="text-left p-2">N° Venta</th>
                    <th className="text-left p-2">Cliente</th>
                    <th className="text-left p-2">Total</th>
                    <th className="text-left p-2">Método</th>
                    <th className="text-left p-2">Sucursal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t cursor-pointer hover:bg-muted/30" onClick={() => void openDetail(row.id)}>
                      <td className="p-2">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="p-2 font-medium">{row.number}</td>
                      <td className="p-2">{row.customer?.name || "-"}</td>
                      <td className="p-2">${Number(row.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2">{row.paymentMethod || "-"}</td>
                      <td className="p-2">{row.branch?.name || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Mostrando {rows.length} de {meta.total} · Total página: {totalLabel}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!canPrev || loading} onClick={() => void load(Math.max(0, meta.offset - meta.limit))}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={!canNext || loading} onClick={() => void load(meta.offset + meta.limit)}>Siguiente</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle venta</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-sm text-muted-foreground">Cargando detalle...</p>
          ) : detail ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{detail.sale.saleNumber}</p>
                  <p className="text-muted-foreground">{new Date(detail.sale.saleDatetime).toLocaleString()}</p>
                </div>
                <Button onClick={() => printSale(detail.sale.id)}>Imprimir</Button>
              </div>

              <div className="rounded-md border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2">Ítem</th>
                      <th className="text-left p-2">Cant.</th>
                      <th className="text-left p-2">P. Unit.</th>
                      <th className="text-left p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="p-2">{item.productNameSnapshot}</td>
                        <td className="p-2">{item.quantity}</td>
                        <td className="p-2">${Number(item.unitPrice || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="p-2">${Number(item.lineTotal || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <p>Subtotal: <b>${Number(detail.sale.subtotalAmount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                <p>Descuento: <b>${Number(detail.sale.discountAmount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                <p>Recargo: <b>${Number(detail.sale.surchargeAmount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                <p>Total: <b>${Number(detail.sale.totalAmount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No se pudo cargar el detalle de la venta.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
