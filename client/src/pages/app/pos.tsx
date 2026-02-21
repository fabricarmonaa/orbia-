import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, authFetch, useAuth } from "@/lib/auth";
import { fetchAddons } from "@/lib/addons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ScanLine } from "lucide-react";
import BarcodeListener, { parseScannedCode } from "@/components/addons/BarcodeListener";
import CameraScanner from "@/components/addons/CameraScanner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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

interface PendingSaleFromOrder {
  orderId: number;
  customerId?: number | null;
  customerDni?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  requiresDelivery?: boolean;
  branchId?: number | null;
}

export default function PosPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
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
  const [pendingSale, setPendingSale] = useState<PendingSaleFromOrder | null>(null);
  const [pendingCustomerName, setPendingCustomerName] = useState("");
  const [pendingCustomerDni, setPendingCustomerDni] = useState("");
  const [pendingCustomerPhone, setPendingCustomerPhone] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string; doc?: string | null; phone?: string | null } | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [addonStatus, setAddonStatus] = useState<Record<string, boolean>>({});
  const [scanEnabled, setScanEnabled] = useState(false);
  const [cameraScanOpen, setCameraScanOpen] = useState(false);
  useEffect(() => {
    fetchAddons()
      .then((d) => setAddonStatus(d || {}))
      .catch(() => setAddonStatus({}));

    try {
      const raw = sessionStorage.getItem("pendingSaleFromOrder");
      if (!raw) return;
      const parsed = JSON.parse(raw) as PendingSaleFromOrder;
      setPendingSale(parsed);
      setPendingCustomerName(parsed.customerName || "");
      setPendingCustomerDni(parsed.customerDni || "");
      setPendingCustomerPhone(parsed.customerPhone || "");
      if (parsed.customerId) {
        setSelectedCustomer({ id: parsed.customerId, name: parsed.customerName || "Cliente", doc: parsed.customerDni || null, phone: parsed.customerPhone || null });
      }
    } catch {
      setPendingSale(null);
    }
  }, []);

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
    const available = Number(product.stockTotal ?? 0);
    setCart((prev) => {
      const existing = prev.find((row) => row.product.id === product.id);
      const nextQty = (existing?.quantity || 0) + 1;
      if (available <= 0) {
        toast({ title: "Sin stock", description: `${product.name} no tiene stock disponible`, variant: "destructive" });
        return prev;
      }
      if (nextQty > available) {
        toast({ title: "Stock insuficiente", description: `${product.name}: máximo ${available}`, variant: "destructive" });
        return prev;
      }
      if (existing) return prev.map((row) => (row.product.id === product.id ? { ...row, quantity: nextQty } : row));
      return [...prev, { product, quantity: 1 }];
    });
  }


  async function handleScanToCart(rawCode: string) {
    setScanEnabled(false);
    const parsed = parseScannedCode(rawCode);
    if (!parsed.code) return;
    try {
      const res = await authFetch(`/api/products/lookup?code=${encodeURIComponent(parsed.code)}`);
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setAddonStatus((prev) => ({ ...prev, barcode_scanner: false }));
        toast({ title: "Addon no activo", description: "El addon de lector está deshabilitado.", variant: "destructive" });
        return;
      }
      if (res.status === 404) {
        toast({ title: "Producto no encontrado", description: `Producto no encontrado: ${parsed.code}`, variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error(json?.error || "No encontrado");
      const product = json.product as ProductRow | null;
      if (!product) {
        toast({ title: "Sin coincidencias", description: `No existe producto con código ${parsed.code}`, variant: "destructive" });
        return;
      }
      addToCart(product);
      toast({ title: "Producto escaneado", description: product.name });
    } catch (err: any) {
      toast({ title: "Error al escanear", description: err?.message || "No se pudo buscar", variant: "destructive" });
    }
  }

  async function confirmPendingCustomer() {
    if (!pendingSale) return;
    const dni = pendingCustomerDni.trim();
    if (!dni) {
      toast({ title: "Cliente sin DNI", description: "Podés continuar la venta sin cliente asociado." });
      setSelectedCustomer(null);
      setPendingSale({ ...pendingSale, customerName: pendingCustomerName, customerDni: "", customerPhone: pendingCustomerPhone, customerId: null });
      return;
    }

    try {
      const byDniRes = await apiRequest("GET", `/api/customers/by-dni?dni=${encodeURIComponent(dni)}`);
      const byDniJson = await byDniRes.json();
      const exact = byDniJson?.data || null;
      if (exact) {
        setSelectedCustomer({ id: exact.id, name: exact.name, doc: exact.doc || null, phone: exact.phone || null });
        setPendingCustomerName(exact.name || pendingCustomerName);
        setPendingCustomerPhone(exact.phone || pendingCustomerPhone);
        setPendingSale({ ...pendingSale, customerId: exact.id, customerName: exact.name || pendingCustomerName, customerDni: exact.doc || dni, customerPhone: exact.phone || pendingCustomerPhone });
        toast({ title: "Cliente confirmado", description: `${exact.name}` });
        return;
      }
      setQuickCreateOpen(true);
    } catch (err: any) {
      toast({ title: "No se pudo validar cliente", description: err?.message || "Error de búsqueda", variant: "destructive" });
    }
  }

  async function quickCreateCustomer() {
    const name = pendingCustomerName.trim();
    const dni = pendingCustomerDni.trim();
    if (!name) {
      toast({ title: "Nombre requerido", variant: "destructive" });
      return;
    }
    if (!dni) {
      toast({ title: "DNI requerido", variant: "destructive" });
      return;
    }

    setCreatingCustomer(true);
    try {
      const res = await apiRequest("POST", "/api/customers", {
        name,
        doc: dni,
        phone: pendingCustomerPhone.trim() || null,
      });
      const json = await res.json();
      if (!res.ok || !json?.data) {
        throw new Error(json?.error || "No se pudo crear cliente");
      }
      const created = json.data;
      setSelectedCustomer({ id: created.id, name: created.name, doc: created.doc || dni, phone: created.phone || pendingCustomerPhone || null });
      setPendingSale((prev) => prev ? ({ ...prev, customerId: created.id, customerName: created.name, customerDni: created.doc || dni, customerPhone: created.phone || pendingCustomerPhone || null }) : prev);
      setQuickCreateOpen(false);
      toast({ title: "Cliente creado y confirmado", description: created.name });
    } catch (err: any) {
      toast({ title: "No se pudo crear cliente", description: err?.message || "Error", variant: "destructive" });
    } finally {
      setCreatingCustomer(false);
    }
  }

  function openSalePrint(saleId: number) {
    const url = `/app/print/sale/${saleId}?autoprint=1`;
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) setLocation(url);
  }

  async function submitSale() {
    if (!cart.length) return;
    const orderCustomerSummary = pendingSale
      ? [pendingCustomerName, pendingCustomerDni ? `DNI:${pendingCustomerDni}` : "", pendingCustomerPhone ? `TEL:${pendingCustomerPhone}` : ""]
          .filter(Boolean)
          .join(" | ")
      : "";
    const res = await apiRequest("POST", "/api/sales", {
      branch_id: pendingSale?.branchId ?? user?.branchId ?? null,
      items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
      discount: discountType === "NONE" ? null : { type: discountType, value: discountValue },
      surcharge: surchargeType === "NONE" ? null : { type: surchargeType, value: surchargeValue },
      payment_method: payment,
      notes: [notes, pendingSale ? `PEDIDO_ORIGEN:${pendingSale.orderId}` : "", orderCustomerSummary].filter(Boolean).join(" | "),
      customer_id: selectedCustomer?.id ?? pendingSale?.customerId ?? null,
    });
    const sale = await res.json();
    setLatestSale({ id: sale.sale_id, number: sale.sale_number, total: sale.total_amount });
    if (pendingSale?.orderId) {
      try {
        await apiRequest("PATCH", `/api/orders/${pendingSale.orderId}/link-sale`, { saleId: sale.sale_id });
        sessionStorage.removeItem("pendingSaleFromOrder");
        setPendingSale(null);
      } catch (err: any) {
        toast({
          title: "Venta registrada",
          description: `No se pudo vincular con el pedido #${pendingSale.orderId}: ${err?.message || "error"}`,
          variant: "destructive",
        });
      }
    }
    toast({ title: "Venta registrada", description: sale.sale_number });
    setCart([]);
    setNotes("");
  }

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Punto de Venta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pendingSale && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader><CardTitle className="text-base">Venta desde pedido #{pendingSale.orderId}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div><Label>Cliente</Label><Input value={pendingCustomerName} onChange={(e) => setPendingCustomerName(e.target.value)} /></div>
                  <div><Label>DNI</Label><Input value={pendingCustomerDni} onChange={(e) => setPendingCustomerDni(e.target.value)} /></div>
                  <div><Label>Teléfono</Label><Input value={pendingCustomerPhone} onChange={(e) => setPendingCustomerPhone(e.target.value)} /></div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{selectedCustomer ? `Cliente asociado: ${selectedCustomer.name}` : "Sin cliente asociado"}</div>
                  <Button variant="outline" size="sm" onClick={confirmPendingCustomer}>Confirmar cliente</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2 flex-wrap">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre/código" className="flex-1 min-w-[220px]" />
            <Button onClick={searchProducts}>Buscar</Button>
            {addonStatus.barcode_scanner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <ScanLine className="w-4 h-4 mr-1" />
                    Escanear con...
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setScanEnabled(true)}>Pistola/Teclado</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCameraScanOpen(true)}>Cámara (móvil)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <BarcodeListener enabled={scanEnabled} onCode={handleScanToCart} onCancel={() => setScanEnabled(false)} durationMs={10000} />
          <CameraScanner open={cameraScanOpen} onClose={() => setCameraScanOpen(false)} onCode={handleScanToCart} timeoutMs={10000} />
          <div className="space-y-2 max-h-[420px] overflow-auto">
            {products.map((product) => (
              <div key={product.id} className="border rounded p-2 flex justify-between items-center">
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.sku || "Sin código"} · Stock: {Number(product.stockTotal ?? 0)} · ${Number(product.estimatedSalePrice ?? product.price).toFixed(2)} {product.pricingMode === "MARGIN" ? "(auto)" : ""}</p>
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
                <p className="text-xs text-muted-foreground">${Number(row.product.estimatedSalePrice ?? row.product.price).toFixed(2)} · Stock actual: {Number(row.product.stockTotal ?? 0)} · Stock post-venta: {Math.max(0, Number(row.product.stockTotal ?? 0) - row.quantity)}</p>
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

          {latestSale && (
            <div className="border rounded p-3 space-y-2">
              <p className="font-medium">Detalle de venta {latestSale.number}</p>
              <p>Total: {latestSale.total}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => openSalePrint(latestSale.id)}>Imprimir</Button>
                <Button variant="secondary" onClick={() => setLatestSale(null)}>Nueva venta</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
      <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear cliente rápido</DialogTitle>
            <DialogDescription>No encontramos un cliente con ese DNI. Podés crearlo y asociarlo a esta venta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div><Label>Nombre</Label><Input value={pendingCustomerName} onChange={(e) => setPendingCustomerName(e.target.value)} /></div>
            <div><Label>DNI</Label><Input value={pendingCustomerDni} onChange={(e) => setPendingCustomerDni(e.target.value)} /></div>
            <div><Label>Teléfono</Label><Input value={pendingCustomerPhone} onChange={(e) => setPendingCustomerPhone(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickCreateOpen(false)} disabled={creatingCustomer}>Cancelar</Button>
            <Button onClick={quickCreateCustomer} disabled={creatingCustomer}>{creatingCustomer ? "Guardando..." : "Crear y asociar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
