import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

type Customer = {
  id: number;
  name: string;
  doc?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  createdAt: string;
  isActive: boolean;
};

type CustomerHistory = {
  customer: Customer;
  sales: Array<{ id: number; number: string; date: string; total: string }>;
  orders: Array<{ id: number; number: number; date: string; statusLabel?: string | null }>;
};

const emptyForm = { name: "", doc: "", email: "", phone: "", address: "", notes: "" };

export default function CustomersPage() {
  const { toast } = useToast();
  const [list, setList] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [historyByCustomer, setHistoryByCustomer] = useState<Record<number, CustomerHistory>>({});
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const selected = useMemo(() => list.find((c) => c.id === selectedId) || null, [list, selectedId]);

  async function load(customQuery?: string) {
    try {
      setLoading(true);
      const query = customQuery ?? q;
      const qs = new URLSearchParams({
        q: query,
        limit: "100",
        offset: "0",
        includeInactive: includeInactive ? "true" : "false",
      });
      const res = await apiRequest("GET", `/api/customers?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cargar");
      const rows = (json?.data || []) as Customer[];
      setList(rows);
      if (rows.length > 0 && (selectedId === null || !rows.some((r) => r.id === selectedId))) {
        setSelectedId(rows[0].id);
      }
      if (rows.length === 0) {
        setSelectedId(null);
      }
    } catch (err: any) {
      toast({ title: "Error al cargar clientes", description: err?.message || "Error", variant: "destructive" });
      setList([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [includeInactive]);

  async function loadHistory(customerId: number) {
    if (historyByCustomer[customerId]) return;
    try {
      const res = await apiRequest("GET", `/api/customers/${customerId}/history`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo cargar historial");
      setHistoryByCustomer((prev) => ({
        ...prev,
        [customerId]: {
          customer: json.customer,
          sales: json.sales || [],
          orders: json.orders || [],
        },
      }));
    } catch (err: any) {
      toast({ title: "Error al cargar historial", description: err?.message || "Error", variant: "destructive" });
      setHistoryByCustomer((prev) => ({
        ...prev,
        [customerId]: { customer: selected as Customer, sales: [], orders: [] },
      }));
    }
  }

  function selectCustomer(row: Customer) {
    setSelectedId(row.id);
    loadHistory(row.id).catch(() => undefined);
  }

  function validateDoc(doc: string) {
    const trimmed = doc.trim();
    if (!trimmed) return true;
    return /^\d{6,15}$/.test(trimmed);
  }

  async function saveCustomer() {
    if (!form.name.trim()) {
      toast({ title: "Nombre requerido", variant: "destructive" });
      return;
    }
    if (!validateDoc(form.doc)) {
      toast({ title: "DNI inválido", description: "Usá solo números (6 a 15 dígitos)", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        doc: form.doc.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };

      const res = editingId
        ? await apiRequest("PATCH", `/api/customers/${editingId}`, payload)
        : await apiRequest("POST", "/api/customers", payload);
      const json = await res.json();
      if (!res.ok) {
        if (json?.code === "CUSTOMER_DUPLICATE") {
          throw new Error("Ya existe un cliente con ese DNI/email/teléfono");
        }
        throw new Error(json?.error || "No se pudo guardar");
      }

      const createdOrUpdated = json.data as Customer;
      toast({ title: editingId ? "Cliente actualizado" : "Cliente creado" });
      setForm(emptyForm);
      setEditingId(null);
      await load();
      setSelectedId(createdOrUpdated.id);
      await loadHistory(createdOrUpdated.id);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "No se pudo guardar cliente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function editCustomer(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      name: customer.name || "",
      doc: customer.doc || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function toggleActive(customer: Customer, active: boolean) {
    try {
      const res = await apiRequest("PATCH", `/api/customers/${customer.id}/active`, { active });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo actualizar estado");
      toast({ title: active ? "Cliente habilitado" : "Cliente deshabilitado" });
      await load();
      setSelectedId(customer.id);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "No se pudo actualizar estado", variant: "destructive" });
    }
  }

  async function removeCustomer(customer: Customer) {
    try {
      const res = await apiRequest("DELETE", `/api/customers/${customer.id}`);
      const json = await res.json();
      if (!res.ok) {
        if (json?.code === "CUSTOMER_HAS_SALES") throw new Error("No se puede eliminar porque tiene ventas asociadas");
        throw new Error(json?.error || "No se pudo eliminar");
      }
      toast({ title: "Cliente eliminado" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "No se pudo eliminar", variant: "destructive" });
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{editingId ? "Editar cliente" : "Nuevo cliente"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <Label>DNI</Label>
              <Input value={form.doc} onChange={(e) => setForm((prev) => ({ ...prev, doc: e.target.value }))} placeholder="Solo números" />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={3} />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveCustomer} disabled={saving}>{editingId ? "Guardar cambios" : "Guardar cliente"}</Button>
              {editingId ? <Button variant="outline" onClick={cancelEdit}>Cancelar</Button> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Clientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <div className="flex gap-2 w-full">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, DNI, email o teléfono" />
                <Button variant="outline" onClick={() => load()}>Buscar</Button>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
                <span className="text-sm text-muted-foreground">Ver inactivos</span>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <Card className="border">
                <CardContent className="p-0">
                  <ScrollArea className="h-[460px]">
                    {loading ? (
                      <p className="p-4 text-sm text-muted-foreground">Cargando clientes...</p>
                    ) : list.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">Todavía no cargaste clientes.</p>
                    ) : (
                      <div className="divide-y">
                        {list.map((row) => (
                          <button key={row.id} className={`w-full text-left p-3 hover:bg-muted/40 ${selectedId === row.id ? "bg-muted/50" : ""}`} onClick={() => selectCustomer(row)}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold">{row.name}</p>
                              <div className="flex items-center gap-1">
                                {row.doc ? <Badge variant="outline">DNI {row.doc}</Badge> : null}
                                {!row.isActive ? <Badge variant="secondary">Inactivo</Badge> : null}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">{row.phone || "Sin teléfono"}</p>
                            <p className="text-xs text-muted-foreground">Alta: {new Date(row.createdAt).toLocaleDateString("es-AR")}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="border">
                <CardContent className="p-4 space-y-3">
                  {!selected ? (
                    <p className="text-sm text-muted-foreground">Seleccioná un cliente para ver el detalle.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Detalle</h3>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => editCustomer(selected)}>Editar</Button>
                          <Button size="sm" variant="outline" onClick={() => toggleActive(selected, !selected.isActive)}>{selected.isActive ? "Deshabilitar" : "Habilitar"}</Button>
                          <Button size="sm" variant="destructive" onClick={() => removeCustomer(selected)}>Eliminar</Button>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-1 text-sm">
                        <p><span className="text-muted-foreground">Nombre:</span> {selected.name}</p>
                        <p><span className="text-muted-foreground">DNI:</span> {selected.doc || "-"}</p>
                        <p><span className="text-muted-foreground">Teléfono:</span> {selected.phone || "-"}</p>
                        <p><span className="text-muted-foreground">Email:</span> {selected.email || "-"}</p>
                        <p><span className="text-muted-foreground">Dirección:</span> {selected.address || "-"}</p>
                        <p><span className="text-muted-foreground">Notas:</span> {selected.notes || "-"}</p>
                      </div>

                      <Tabs defaultValue="sales" className="w-full">
                        <TabsList>
                          <TabsTrigger value="sales">Ventas</TabsTrigger>
                          <TabsTrigger value="orders">Pedidos</TabsTrigger>
                        </TabsList>
                        <TabsContent value="sales" className="pt-2">
                          {(historyByCustomer[selected.id]?.sales || []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sin historial aún.</p>
                          ) : (
                            <div className="space-y-2">
                              {historyByCustomer[selected.id].sales.map((row) => (
                                <div key={row.id} className="rounded border p-2 text-sm flex items-center justify-between">
                                  <span>#{row.number} · {new Date(row.date).toLocaleDateString("es-AR")}</span>
                                  <span className="font-medium">${Number(row.total || 0).toLocaleString("es-AR")}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </TabsContent>
                        <TabsContent value="orders" className="pt-2">
                          {(historyByCustomer[selected.id]?.orders || []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sin historial aún.</p>
                          ) : (
                            <div className="space-y-2">
                              {historyByCustomer[selected.id].orders.map((row) => (
                                <div key={row.id} className="rounded border p-2 text-sm flex items-center justify-between">
                                  <span>Pedido #{row.number} · {new Date(row.date).toLocaleDateString("es-AR")}</span>
                                  <Badge variant="secondary">{row.statusLabel || "Sin estado"}</Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
