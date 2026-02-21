import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

type Product = { id:number; name:string; sku?:string };

export default function PurchasesPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState([{ productId: 0, quantity: 1, unitPrice: 0 }]);
  const [providerName, setProviderName] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [notes, setNotes] = useState("");
  const [purchases, setPurchases] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const total = useMemo(() => rows.reduce((acc, r) => acc + (Number(r.quantity) * Number(r.unitPrice)), 0), [rows]);

  async function loadBase() {
    const [p1, p2] = await Promise.all([
      apiRequest("GET", "/api/products?pageSize=200").then(r => r.json()).catch(() => ({ data: [] })),
      apiRequest("GET", "/api/purchases?limit=30").then(r => r.json()).catch(() => ({ data: [] })),
    ]);
    setProducts(p1.data || []);
    setPurchases(p2.data || []);
  }
  useEffect(() => { loadBase(); }, []);

  async function saveManual() {
    try {
      const valid = rows.filter((r) => r.productId > 0 && r.quantity > 0);
      if (!valid.length) throw new Error("Agregá al menos un item válido");
      const res = await apiRequest("POST", "/api/purchases", { providerName, currency, notes, items: valid });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar");
      toast({ title: "Compra guardada" });
      setRows([{ productId: 0, quantity: 1, unitPrice: 0 }]); setProviderName(""); setNotes("");
      loadBase();
    } catch (e:any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function previewImport() {
    try {
      if (!file) throw new Error("Seleccioná archivo .xlsx");
      const fd = new FormData(); fd.append("file", file);
      const res = await apiRequest("POST", "/api/purchases/import/preview", fd);
      const json = await res.json(); if (!res.ok) throw new Error(json?.error || "Preview inválido");
      setPreview(json); setMapping(json.suggestedMapping || {});
    } catch (e:any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function commitImport() {
    try {
      if (!file) throw new Error("Seleccioná archivo .xlsx");
      const fd = new FormData(); fd.append("file", file); fd.append("mapping", JSON.stringify(mapping));
      const res = await apiRequest("POST", "/api/purchases/import/commit", fd);
      const json = await res.json(); if (!res.ok) throw new Error(json?.error || "Importación inválida");
      toast({ title: "Importación completada" }); setPreview(null); setFile(null); loadBase();
    } catch (e:any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return <div className="space-y-4">
    <Tabs defaultValue="manual">
      <TabsList><TabsTrigger value="manual">Manual</TabsTrigger><TabsTrigger value="excel">Importar Excel</TabsTrigger></TabsList>
      <TabsContent value="manual">
        <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Nueva compra manual</CardTitle></CardHeader><CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-2">
            <div><Label>Proveedor</Label><Input value={providerName} onChange={(e)=>setProviderName(e.target.value)} /></div>
            <div><Label>Moneda</Label><Input value={currency} onChange={(e)=>setCurrency(e.target.value.toUpperCase())} /></div>
            <div><Label>Notas</Label><Input value={notes} onChange={(e)=>setNotes(e.target.value)} /></div>
          </div>
          <div className="space-y-2">{rows.map((r, i) => <div key={i} className="grid md:grid-cols-4 gap-2">
            <select className="border rounded px-2" value={r.productId} onChange={(e)=>setRows((prev)=>prev.map((x,ix)=>ix===i?{...x,productId:Number(e.target.value)}:x))}>
              <option value={0}>Producto</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Input type="number" value={r.quantity} onChange={(e)=>setRows((prev)=>prev.map((x,ix)=>ix===i?{...x,quantity:Number(e.target.value)}:x))} />
            <Input type="number" value={r.unitPrice} onChange={(e)=>setRows((prev)=>prev.map((x,ix)=>ix===i?{...x,unitPrice:Number(e.target.value)}:x))} />
            <Button variant="outline" onClick={()=>setRows((prev)=>prev.filter((_,ix)=>ix!==i))}>Quitar</Button>
          </div>)}</div>
          <div className="flex justify-between"><Button variant="outline" onClick={()=>setRows((p)=>[...p,{productId:0,quantity:1,unitPrice:0}])}>Agregar ítem</Button><p className="font-semibold">Total: ${total.toLocaleString("es-AR")}</p></div>
          <Button onClick={saveManual}>Guardar compra</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Últimas compras</CardTitle></CardHeader><CardContent>{purchases.map((p)=> <div key={p.id} className="border rounded p-2 text-sm flex justify-between"><span>#{p.id} · {p.providerName || "Sin proveedor"}</span><span>${Number(p.totalAmount||0).toLocaleString("es-AR")}</span></div>)}</CardContent></Card>
        </div>
      </TabsContent>
      <TabsContent value="excel">
        <Card><CardHeader><CardTitle>Importar Excel</CardTitle></CardHeader><CardContent className="space-y-2">
          <Input type="file" accept=".xlsx" onChange={(e)=>setFile(e.target.files?.[0]||null)} />
          <Button onClick={previewImport}>Preview</Button>
          {preview && <div className="space-y-2"><pre className="text-xs overflow-auto">{JSON.stringify(preview.rowsPreview?.slice(0, 5) || [], null, 2)}</pre><Button onClick={commitImport}>Confirmar importación</Button></div>}
        </CardContent></Card>
      </TabsContent>
    </Tabs>
  </div>;
}
