import { useMemo, useState } from "react";
import { apiRequest, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { printTicket, type TicketData, type TicketSize } from "@/components/sales/ticket-print";

interface ProductRow {
  id: number;
  name: string;
  description?: string | null;
  sku?: string | null;
  price: string;
  pricingMode?: "MANUAL" | "MARGIN";
  estimatedSalePrice?: number;
  stockTotal?: number;
  branchStock?: Array<{ branchId: number; stock: number }>;
}

interface CartItem {
  product: ProductRow;
  quantity: number;
}

export default function PosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountType, setDiscountType] = useState<"NONE" | "PERCENT" | "FIXED">("NONE");
  const [discountValue, setDiscountValue] = useState(0);
  const [surchargeType, setSurchargeType] = useState<"NONE" | "PERCENT" | "FIXED">("NONE");
  const [surchargeValue, setSurchargeValue] = useState(0);
  const [payment, setPayment] = useState("EFECTIVO");
  const [notes, setNotes] = useState("");
  const [latestSale, setLatestSale] = useState<{ id: number; number: string; total: string } | null>(null);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const ticketSizeKey = "orbia_ticket_size_pref";
  const [ticketSize, setTicketSize] = useState<TicketSize>(() => (localStorage.getItem(ticketSizeKey) as TicketSize) || "80mm");

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.product.estimatedSalePrice ?? item.product.price) * item.quantity, 0), [cart]);
  const discountAmount = useMemo(() => {
    if (discountType === "PERCENT") return Math.min(subtotal, (subtotal * discountValue) / 100);
    if (discountType === "FIXED") return Math.min(subtotal, discountValue);
    return 0;
  }, [subtotal, discountType, discountValue]);
  const surchargeAmount = useMemo(() => {
    const base = subtotal - discountAmount;
    if (surchargeType === "PERCENT") return (base * surchargeValue) / 100;
    if (surchargeType === "FIXED") return surchargeValue;
    return 0;
  }, [subtotal, discountAmount, surchargeType, surchargeValue]);
  const total = subtotal - discountAmount + surchargeAmount;

  async function searchProducts() {
    const res = await apiRequest("GET", `/api/products?q=${encodeURIComponent(q)}&pageSize=20`);
    const json = await res.json();
    setProducts(json.data || []);
  }

  function addToCart(product: ProductRow) {
    setCart((prev) => {
      const existing = prev.find((row) => row.product.id === product.id);
      if (existing) return prev.map((row) => (row.product.id === product.id ? { ...row, quantity: row.quantity + 1 } : row));
      return [...prev, { product, quantity: 1 }];
    });
  }

  async function submitSale() {
    if (!cart.length) return;
    const res = await apiRequest("POST", "/api/sales", {
      branch_id: user?.branchId ?? null,
      items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
      discount: discountType === "NONE" ? null : { type: discountType, value: discountValue },
      surcharge: surchargeType === "NONE" ? null : { type: surchargeType, value: surchargeValue },
      payment_method: payment,
      notes,
    });
    const sale = await res.json();
    setLatestSale({ id: sale.sale_id, number: sale.sale_number, total: sale.total_amount });
    toast({ title: "Venta registrada", description: sale.sale_number });
    const printRes = await apiRequest("POST", `/api/sales/${sale.sale_id}/print-data`);
    const printJson = await printRes.json();
    setTicketData(printJson.data);
    setCart([]);
    setNotes("");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Punto de Venta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre/código" />
            <Button onClick={searchProducts}>Buscar</Button>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-auto">
            {products.map((product) => (
              <div key={product.id} className="border rounded p-2 flex justify-between items-center">
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.sku || "Sin código"} · ${Number(product.estimatedSalePrice ?? product.price).toFixed(2)} {product.pricingMode === "MARGIN" ? "(auto)" : ""}</p>
                </div>
                <Button size="sm" onClick={() => addToCart(product)}>Agregar</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Carrito de Ventas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cart.map((row) => (
            <div key={row.product.id} className="flex items-center justify-between border rounded px-2 py-1">
              <div>
                <p className="text-sm font-medium">{row.product.name}</p>
                <p className="text-xs text-muted-foreground">${Number(row.product.estimatedSalePrice ?? row.product.price).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setCart((prev) => prev.map((i) => i.product.id === row.product.id ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))}>-</Button>
                <span>{row.quantity}</span>
                <Button size="sm" variant="outline" onClick={() => setCart((prev) => prev.map((i) => i.product.id === row.product.id ? { ...i, quantity: i.quantity + 1 } : i))}>+</Button>
                <Button size="sm" variant="destructive" onClick={() => setCart((prev) => prev.filter((i) => i.product.id !== row.product.id))}>x</Button>
              </div>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Descuento</Label>
              <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sin descuento</SelectItem>
                  <SelectItem value="PERCENT">Porcentaje</SelectItem>
                  <SelectItem value="FIXED">Monto fijo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value || 0))} />
            </div>
            <div>
              <Label>Recargo</Label>
              <Select value={surchargeType} onValueChange={(v: any) => setSurchargeType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sin recargo</SelectItem>
                  <SelectItem value="PERCENT">Porcentaje</SelectItem>
                  <SelectItem value="FIXED">Monto fijo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <Input type="number" value={surchargeValue} onChange={(e) => setSurchargeValue(Number(e.target.value || 0))} />
            </div>
          </div>

          <div>
            <Label>Método de pago</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                <SelectItem value="TARJETA">Tarjeta</SelectItem>
                <SelectItem value="OTRO">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="space-y-1 text-sm">
            <p>Subtotal: ${subtotal.toFixed(2)}</p>
            <p>Descuento: ${discountAmount.toFixed(2)}</p>
            <p>Recargo: ${surchargeAmount.toFixed(2)}</p>
            <p className="font-semibold">Total: ${total.toFixed(2)}</p>
          </div>

          <Button onClick={submitSale} disabled={!cart.length}>Registrar venta</Button>

          {latestSale && ticketData && (
            <div className="border rounded p-3 space-y-2">
              <p className="font-medium">Detalle de venta {latestSale.number}</p>
              <p>Total: {latestSale.total}</p>
              <div className="flex gap-2">
                <Select value={ticketSize} onValueChange={(v: TicketSize) => { setTicketSize(v); localStorage.setItem(ticketSizeKey, v); }}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58mm">58mm</SelectItem>
                    <SelectItem value="80mm">80mm</SelectItem>
                    <SelectItem value="A4">A4</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => printTicket(ticketData, ticketSize)}>Imprimir</Button>
                <Button variant="secondary" onClick={() => setLatestSale(null)}>Nueva venta</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
