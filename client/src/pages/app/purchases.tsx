import { useEffect, useMemo, useState } from "react";
import { apiRequest, authFetch } from "@/lib/auth";
import { fetchAddons } from "@/lib/addons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ScanLine } from "lucide-react";
import BarcodeListener, { parseScannedCode } from "@/components/addons/BarcodeListener";
import CameraScanner from "@/components/addons/CameraScanner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface PurchaseRow {
  id: number;
  number?: number | string;
  supplierName?: string | null;
  total?: string | number | null;
  totalAmount?: string | number | null;
  createdAt?: string;
  currency?: string | null;
  itemCount?: number;
  itemsCount?: number;
}

interface ProviderRow {
  id: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  notes?: string | null;
  active: boolean;
}

interface ManualFormItem {
  productName: string;
  productCode: string;
  unitPrice: string;
  qty: string;
}

interface PurchaseDetail {
  purchase: PurchaseRow;
  items: Array<{ productName: string; productCode?: string | null; unitPrice: string; qty: string; lineTotal: string }>;
}

export default function PurchasesPage() {
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [providerName, setProviderName] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [notes, setNotes] = useState("");
  const [draftItem, setDraftItem] = useState<ManualFormItem>({ productName: "", productCode: "", unitPrice: "", qty: "" });
  const [items, setItems] = useState<ManualFormItem[]>([]);
  const [addonStatus, setAddonStatus] = useState<Record<string, boolean>>({});
  const [scanEnabled, setScanEnabled] = useState(false);
  const [cameraScanOpen, setCameraScanOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [lastCreatedId, setLastCreatedId] = useState<number | null>(null);

  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [providerId, setProviderId] = useState<string>("");

  const [providerOpen, setProviderOpen] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: "", address: "", phone: "", email: "", contactName: "", notes: "" });
  const [savingProvider, setSavingProvider] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);

  const total = useMemo(() => items.reduce((acc, r) => acc + (Number(r.qty || 0) * Number(r.unitPrice || 0)), 0), [items]);

  async function loadPurchases() {
    try {
      const res = await apiRequest("GET", "/api/purchases?limit=30&offset=0");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo listar compras");
      const rows = (json.items || json.data || []) as PurchaseRow[];
      setPurchases(rows);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "No se pudo listar compras", variant: "destructive" });
      setPurchases([]);
    }
  }

  async function loadProviders() {
    try {
      const res = await apiRequest("GET", "/api/providers");
      const json = await res.json();
      setProviders(json.data || []);
    } catch {
      setProviders([]);
    }
  }

  useEffect(() => {
    loadPurchases().catch(() => undefined);
    loadProviders().catch(() => undefined);
    fetchAddons()
      .then((d) => setAddonStatus(d || {}))
      .catch(() => setAddonStatus({}));
  }, []);

  function addItem() {
    if (!draftItem.productName.trim() || !draftItem.productCode.trim() || Number(draftItem.unitPrice) < 0 || Number(draftItem.qty) < 1) {
      toast({ title: "Datos incompletos", description: "Completá nombre, código, precio y cantidad válidos.", variant: "destructive" });
      return;
    }
    setItems((prev) => [...prev, { ...draftItem }]);
    setDraftItem({ productName: "", productCode: "", unitPrice: "", qty: "" });
  }

  async function handleScanCode(rawCode: string) {
    setScanEnabled(false);
    const parsed = parseScannedCode(rawCode);
    if (!parsed.code) return;
    setDraftItem((prev) => ({ ...prev, productCode: parsed.code }));

    try {
      const res = await authFetch(`/api/products/lookup?code=${encodeURIComponent(parsed.code)}`);
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setAddonStatus((prev) => ({ ...prev, barcode_scanner: false }));
        toast({ title: "Addon no activo", description: "El addon de lector está deshabilitado.", variant: "destructive" });
      }
      if (res.status === 200 && json?.product?.name) {
        setDraftItem((prev) => ({ ...prev, productCode: parsed.code, productName: prev.productName || json.product.name }));
      }
    } catch {
      // lookup opcional
    }

    toast({ title: "Código capturado", description: `Código: ${parsed.code}` });
  }

  async function saveManual() {
    try {
      if (!providerId) throw new Error("Seleccioná un proveedor");
      if (!items.length) throw new Error("Agregá al menos un ítem");
      setSavingManual(true);
      const selProv = providers.find(p => p.id === Number(providerId));
      const payload = {
        supplierName: selProv?.name || "Proveedor",
        providerId: Number(providerId),
        currency,
        notes,
        items: items.map((i) => ({ productName: i.productName, productCode: i.productCode, unitPrice: Number(i.unitPrice), qty: Number(i.qty) })),
      };
      const res = await apiRequest("POST", "/api/purchases/manual", payload);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.message || "No se pudo guardar");
      toast({ title: "Compra guardada", description: `ID #${json.purchaseId}` });
      setProviderId("");
      setNotes("");
      setItems([]);
      setLastCreatedId(Number(json.purchaseId));
      await loadPurchases();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingManual(false);
    }
  }

  async function saveProvider() {
    try {
      if (!newProvider.name.trim()) throw new Error("Nombre requerido");
      setSavingProvider(true);
      const res = await apiRequest("POST", "/api/providers", newProvider);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear proveedor");
      toast({ title: "Proveedor creado" });
      setProviderOpen(false);
      setNewProvider({ name: "", address: "", phone: "", email: "", contactName: "", notes: "" });
      await loadProviders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingProvider(false);
    }
  }

  async function openDetail(id: number) {
    try {
      setDetailOpen(true);
      setDetailLoading(true);
      const res = await apiRequest("GET", `/api/purchases/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cargar detalle");
      setDetail(json as PurchaseDetail);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "No se pudo cargar detalle", variant: "destructive" });
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function previewImport() {
    try {
      if (!file) throw new Error("Seleccioná archivo .xlsx");
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiRequest("POST", "/api/purchases/import/preview", fd);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Preview inválido");
      setPreview(json);
      setMapping(json.suggestedMapping || {});
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function commitImport() {
    try {
      if (!file) throw new Error("Seleccioná archivo .xlsx");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      const res = await apiRequest("POST", "/api/purchases/import/commit", fd);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Importación inválida");
      toast({ title: "Importación completada" });
      setPreview(null);
      setFile(null);
      await loadPurchases();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <Tabs defaultValue="manual">
        <TabsList>
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="excel">Importar Excel</TabsTrigger>
          <TabsTrigger value="proveedores">Proveedores</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Carga manual</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-3 gap-2">
                  <div>
                    <Label>Proveedor</Label>
                    <div className="flex gap-2">
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={providerId}
                        onChange={(e) => setProviderId(e.target.value)}
                      >
                        <option value="">Seleccionar...</option>
                        {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <Button variant="outline" onClick={() => setProviderOpen(true)}>+</Button>
                    </div>
                  </div>
                  <div>
                    <Label>Moneda</Label>
                    <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <Label>Notas</Label>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>

                <div className="grid md:grid-cols-5 gap-2">
                  <div>
                    <Label>Nombre producto</Label>
                    <Input value={draftItem.productName} onChange={(e) => setDraftItem((p) => ({ ...p, productName: e.target.value }))} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Label>Código producto</Label>
                      {addonStatus.barcode_scanner && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" size="sm" variant="outline">
                              <ScanLine className="h-4 w-4 mr-1" />
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
                    <Input value={draftItem.productCode} onChange={(e) => setDraftItem((p) => ({ ...p, productCode: e.target.value }))} />
                    <BarcodeListener enabled={scanEnabled} onCode={handleScanCode} onCancel={() => setScanEnabled(false)} durationMs={10000} />
                    <CameraScanner open={cameraScanOpen} onClose={() => setCameraScanOpen(false)} onCode={handleScanCode} timeoutMs={10000} />
                  </div>
                  <div>
                    <Label>Precio por unidad</Label>
                    <Input type="number" min={0} value={draftItem.unitPrice} onChange={(e) => setDraftItem((p) => ({ ...p, unitPrice: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Cantidad</Label>
                    <Input type="number" min={1} value={draftItem.qty} onChange={(e) => setDraftItem((p) => ({ ...p, qty: e.target.value }))} />
                  </div>
                  <div className="flex items-end">
                    <Button variant="outline" className="w-full" onClick={addItem}>Agregar ítem</Button>
                  </div>
                </div>

                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left p-2">Nombre</th>
                        <th className="text-left p-2">Código</th>
                        <th className="text-right p-2">P. Unitario</th>
                        <th className="text-right p-2">Cantidad</th>
                        <th className="text-right p-2">Subtotal</th>
                        <th className="text-right p-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!items.length ? (
                        <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Sin ítems agregados.</td></tr>
                      ) : items.map((it, idx) => (
                        <tr key={`${it.productCode}-${idx}`} className="border-t">
                          <td className="p-2">{it.productName}</td>
                          <td className="p-2">{it.productCode}</td>
                          <td className="p-2 text-right">${Number(it.unitPrice).toLocaleString("es-AR")}</td>
                          <td className="p-2 text-right">{Number(it.qty).toLocaleString("es-AR")}</td>
                          <td className="p-2 text-right">${(Number(it.qty) * Number(it.unitPrice)).toLocaleString("es-AR")}</td>
                          <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>Quitar</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between">
                  <p className="font-semibold">Total: ${total.toLocaleString("es-AR")}</p>
                  <Button onClick={saveManual} disabled={savingManual}>{savingManual ? "Guardando..." : "Guardar compra"}</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Últimas compras</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-[520px] overflow-auto">
                {!purchases.length ? (
                  <p className="text-sm text-muted-foreground">Todavía no registraste compras.</p>
                ) : purchases.map((p) => (
                  <button key={p.id} className={`w-full border rounded p-2 text-sm text-left ${lastCreatedId === p.id ? "bg-primary/5 border-primary/40" : ""}`} onClick={() => openDetail(p.id)}>
                    <div className="flex justify-between gap-2">
                      <span>#{p.number || p.id} · {p.supplierName || "Sin proveedor"}</span>
                      <span>${Number(p.totalAmount ?? p.total ?? 0).toLocaleString("es-AR")}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{p.createdAt ? new Date(p.createdAt).toLocaleDateString("es-AR") : "-"} · {p.itemsCount ?? p.itemCount ?? 0} ítems</div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="excel">
          <Card>
            <CardHeader><CardTitle>Importar Excel</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <Button onClick={previewImport}>Preview</Button>
              {preview && (
                <div className="space-y-3 mt-4">
                  <div className="text-sm bg-muted/40 p-2 rounded border">
                    <strong>Columnas detectadas:</strong> {preview.detectedHeaders?.join(", ") || "-"}
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="p-2 text-left">Fila</th>
                          <th className="p-2 text-left">Código / Título</th>
                          <th className="p-2 text-left">Proveedor</th>
                          <th className="p-2 text-right">Cant.</th>
                          <th className="p-2 text-right">Precio Un.</th>
                          <th className="p-2 text-left">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(preview.rowsPreview || []).slice(0, 10).map((row: any, idx: number) => {
                          const hasErrors = row.errors && row.errors.length > 0;
                          return (
                            <tr key={idx} className={`border-t ${hasErrors ? "bg-red-50/50" : "bg-green-50/20"}`}>
                              <td className="p-2">{idx + 2}</td>
                              <td className="p-2">
                                <div className="font-medium truncate max-w-[200px]">{row.normalized.name || <span className="text-red-500 text-xs">Falta nombre</span>}</div>
                                <div className="text-xs text-muted-foreground">{row.normalized.code || "-"}</div>
                              </td>
                              <td className="p-2 text-xs truncate max-w-[120px]">{row.normalized.supplier_name || "-"}</td>
                              <td className="p-2 text-right font-medium">{row.normalized.quantity !== null ? row.normalized.quantity : "-"}</td>
                              <td className="p-2 text-right font-medium">
                                {row.normalized.unit_price !== null ? `$${row.normalized.unit_price.toLocaleString("es-AR")}` : "-"}
                              </td>
                              <td className="p-2">
                                {hasErrors ? (
                                  <Badge variant="destructive" className="whitespace-nowrap">{row.errors.join(", ")}</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">OK</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {preview.rowsPreview?.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">Mostrando solo las primeras 10 filas de preview.</p>
                  )}
                  <Button onClick={commitImport} className="w-full mt-2">Confirmar importación</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="proveedores">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Proveedores</CardTitle>
              <Button onClick={() => setProviderOpen(true)}>Crear Proveedor</Button>
            </CardHeader>
            <CardContent>
              {providers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay proveedores registrados.</p>
              ) : (
                <div className="overflow-x-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-3 text-left">Nombre</th>
                        <th className="p-3 text-left">Teléfono</th>
                        <th className="p-3 text-left">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map(p => (
                        <tr key={p.id} className="border-t hover:bg-muted/10 transition-colors">
                          <td className="p-3 font-medium">{p.name}</td>
                          <td className="p-3">{p.phone || "-"}</td>
                          <td className="p-3 text-muted-foreground">{p.email || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={providerOpen} onOpenChange={setProviderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Proveedor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Nombre (*)</Label>
              <Input value={newProvider.name} onChange={e => setNewProvider({ ...newProvider, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label>Teléfono</Label>
                <Input value={newProvider.phone} onChange={e => setNewProvider({ ...newProvider, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input value={newProvider.email} onChange={e => setNewProvider({ ...newProvider, email: e.target.value })} />
              </div>
              <div>
                <Label>Dirección</Label>
                <Input value={newProvider.address} onChange={e => setNewProvider({ ...newProvider, address: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={newProvider.notes} onChange={e => setNewProvider({ ...newProvider, notes: e.target.value })} />
            </div>
            <Button className="w-full mt-2" onClick={saveProvider} disabled={savingProvider}>
              {savingProvider ? "Guardando..." : "Guardar Proveedor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de compra</DialogTitle>
            <DialogDescription>Revisá los ítems, cantidades y montos de la compra seleccionada.</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-sm text-muted-foreground">Cargando detalle...</p>
          ) : !detail ? (
            <p className="text-sm text-muted-foreground">Sin datos.</p>
          ) : (
            <div className="space-y-3">
              <div className="text-sm">
                <p><b>Compra:</b> #{detail.purchase.number || detail.purchase.id}</p>
                <p><b>Proveedor:</b> {detail.purchase.supplierName || "Sin proveedor"}</p>
                <p><b>Fecha:</b> {detail.purchase.createdAt ? new Date(detail.purchase.createdAt).toLocaleString("es-AR") : "-"}</p>
              </div>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left">Producto</th>
                      <th className="p-2 text-left">Código</th>
                      <th className="p-2 text-right">Unitario</th>
                      <th className="p-2 text-right">Cant.</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it, idx) => (
                      <tr key={`${it.productCode || "none"}-${idx}`} className="border-t">
                        <td className="p-2">{it.productName}</td>
                        <td className="p-2">{it.productCode || "-"}</td>
                        <td className="p-2 text-right">${Number(it.unitPrice || 0).toLocaleString("es-AR")}</td>
                        <td className="p-2 text-right">{Number(it.qty || 0).toLocaleString("es-AR")}</td>
                        <td className="p-2 text-right">${Number(it.lineTotal || 0).toLocaleString("es-AR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-right font-semibold">Total: ${Number(detail.purchase.total || 0).toLocaleString("es-AR")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
