import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export default function CustomersPage() {
  const { toast } = useToast();
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", doc: "", email: "", phone: "", address: "", notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [historyByCustomer, setHistoryByCustomer] = useState<Record<number, any[]>>({});

  async function load() {
    const res = await apiRequest("GET", `/api/customers?${new URLSearchParams({ q })}`);
    const json = await res.json();
    setList(json.items || json.data || []);
  }
  useEffect(() => { load().catch(()=>{}); }, []);



  async function toggleCustomer(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!historyByCustomer[id]) {
      const res = await apiRequest("GET", `/api/customers/${id}/history?limit=10`);
      const json = await res.json();
      setHistoryByCustomer((prev) => ({ ...prev, [id]: json.items || [] }));
    }
  }
  async function createManual() {
    try {
      const res = await apiRequest("POST", "/api/customers", form);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo crear");
      toast({ title: "Cliente creado" });
      setForm({ name: "", doc: "", email: "", phone: "", address: "", notes: "" });
      load();
    } catch (e:any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function previewImport() {
    try {
      if (!file) throw new Error("Seleccioná archivo .xlsx");
      const fd = new FormData(); fd.append("file", file);
      const res = await apiRequest("POST", "/api/customers/import/preview", fd);
      const json = await res.json(); if (!res.ok) throw new Error(json?.error || "Preview inválido");
      setPreview(json); setMapping(json.suggestedMapping || {});
    } catch (e:any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function commitImport() {
    try {
      if (!file) throw new Error("Seleccioná archivo .xlsx");
      const fd = new FormData(); fd.append("file", file); fd.append("mapping", JSON.stringify(mapping));
      const res = await apiRequest("POST", "/api/customers/import/commit", fd);
      const json = await res.json(); if (!res.ok) throw new Error(json?.error || "Importación inválida");
      toast({ title: "Importación completada" }); setPreview(null); setFile(null); load();
    } catch (e:any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  return <div className="space-y-4">
    <Tabs defaultValue="manual">
      <TabsList><TabsTrigger value="manual">Manual</TabsTrigger><TabsTrigger value="excel">Importar Excel</TabsTrigger></TabsList>
      <TabsContent value="manual">
        <Card><CardHeader><CardTitle>Nuevo cliente</CardTitle></CardHeader><CardContent className="space-y-2">
          <div className="grid md:grid-cols-2 gap-2">
            <div><Label>Nombre / Razón social</Label><Input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} /></div>
            <div><Label>DNI/CUIT</Label><Input value={form.doc} onChange={(e)=>setForm({...form,doc:e.target.value})} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} /></div>
            <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} /></div>
            <div className="md:col-span-2"><Label>Dirección</Label><Input value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} /></div>
            <div className="md:col-span-2"><Label>Notas</Label><Input value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} /></div>
          </div>
          <Button onClick={createManual}>Guardar cliente</Button>
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="excel">
        <Card><CardHeader><CardTitle>Importar clientes</CardTitle></CardHeader><CardContent className="space-y-2">
          <Input type="file" accept=".xlsx" onChange={(e)=>setFile(e.target.files?.[0]||null)} />
          <Button onClick={previewImport}>Preview</Button>
          {preview && <div className="space-y-2"><pre className="text-xs overflow-auto">{JSON.stringify(preview.rowsPreview?.slice(0,5)||[], null, 2)}</pre><Button onClick={commitImport}>Confirmar importación</Button></div>}
        </CardContent></Card>
      </TabsContent>
    </Tabs>

    <Card><CardHeader><CardTitle>Listado</CardTitle></CardHeader><CardContent className="space-y-2"><div className="flex gap-2"><Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Buscar"/><Button onClick={load}>Buscar</Button></div>{list.map((c)=><div key={c.id} className="border rounded p-2 text-sm">
<div className="cursor-pointer" onClick={()=>toggleCustomer(c.id)}><div className="font-medium">{c.name}</div><div className="text-muted-foreground">{c.doc || '-'} · {c.phone || c.email || '-'}</div><div className="text-xs">Antigüedad: {new Date(c.createdAt).toLocaleDateString()}</div></div>
{expandedId===c.id && <div className="mt-2 border-t pt-2 space-y-1">
<p className="text-xs font-medium text-muted-foreground">Historial de ventas</p>
{(historyByCustomer[c.id]||[]).length ? (historyByCustomer[c.id]||[]).map((h:any)=> <div key={h.id} className="text-xs flex justify-between"><span>{h.saleNumber}</span><span>${Number(h.totalAmount||0).toLocaleString('es-AR')}</span></div>) : <p className="text-xs text-muted-foreground">Sin historial</p>}
</div>}
</div>)}</CardContent></Card>
  </div>;
}
