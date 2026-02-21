import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface PurchaseRow {
  id: number;
  providerName?: string | null;
  totalAmount?: string | number | null;
  purchaseDate?: string;
}

interface ManualFormItem {
  productName: string;
  productCode: string;
  unitPrice: string;
  qty: string;
}

export default function PurchasesPage() {
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [providerName, setProviderName] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [notes, setNotes] = useState("");
  const [draftItem, setDraftItem] = useState<ManualFormItem>({ productName: "", productCode: "", unitPrice: "", qty: "" });
  const [items, setItems] = useState<ManualFormItem[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const total = useMemo(
    () => items.reduce((acc, r) => acc + (Number(r.qty || 0) * Number(r.unitPrice || 0)), 0),
    [items]
  );

  async function loadPurchases() {
    const p2 = await apiRequest("GET", "/api/purchases?limit=30").then((r) => r.json()).catch(() => ({ data: [] }));
    setPurchases(p2.data || []);
  }

  useEffect(() => {
    loadPurchases();
  }, []);

  function addItem() {
    if (!draftItem.productName.trim() || !draftItem.productCode.trim() || Number(draftItem.unitPrice) <= 0 || Number(draftItem.qty) <= 0) {
      toast({ title: "Datos incompletos", description: "Completá nombre, código, precio y cantidad válidos.", variant: "destructive" });
      return;
    }
    setItems((prev) => [...prev, { ...draftItem }]);
    setDraftItem({ productName: "", productCode: "", unitPrice: "", qty: "" });
  }

  async function saveManual() {
    try {
      if (!providerName.trim()) throw new Error("Ingresá proveedor");
      if (!items.length) throw new Error("Agregá al menos un ítem");
      const payload = {
        supplierName: providerName,
        currency,
        notes,
        items: items.map((i) => ({
          productName: i.productName,
          productCode: i.productCode,
          unitPrice: Number(i.unitPrice),
          qty: Number(i.qty),
        })),
      };
      const res = await apiRequest("POST", "/api/purchases/manual", payload);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar");
      toast({ title: "Compra guardada", description: `ID #${json.purchaseId}` });
      setProviderName("");
      setNotes("");
      setItems([]);
      await loadPurchases();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
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
    <div className="space-y-4">
      <Tabs defaultValue="manual">
        <TabsList>
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="excel">Importar Excel</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Nueva compra manual</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-3 gap-2">
                  <div>
                    <Label>Proveedor</Label>
                    <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} />
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
                    <Label>Código producto</Label>
                    <Input value={draftItem.productCode} onChange={(e) => setDraftItem((p) => ({ ...p, productCode: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Precio por unidad</Label>
                    <Input type="number" min={0} value={draftItem.unitPrice} onChange={(e) => setDraftItem((p) => ({ ...p, unitPrice: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Cantidad de unidades</Label>
                    <Input type="number" min={0} value={draftItem.qty} onChange={(e) => setDraftItem((p) => ({ ...p, qty: e.target.value }))} />
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
                  <Button onClick={saveManual}>Guardar compra</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Últimas compras</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {purchases.map((p) => (
                  <div key={p.id} className="border rounded p-2 text-sm flex justify-between">
                    <span>#{p.id} · {p.providerName || "Sin proveedor"}</span>
                    <span>${Number(p.totalAmount || 0).toLocaleString("es-AR")}</span>
                  </div>
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
                <div className="space-y-2">
                  <pre className="text-xs overflow-auto">{JSON.stringify(preview.rowsPreview?.slice(0, 5) || [], null, 2)}</pre>
                  <Button onClick={commitImport}>Confirmar importación</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
