import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface StatusDef { id: number; code: string; label: string; color?: string | null; isDefault: boolean; isFinal: boolean; isActive: boolean; }

export function StatusesSettings() {
  const [entity, setEntity] = useState<"ORDER" | "PRODUCT" | "DELIVERY">("ORDER");
  const [rows, setRows] = useState<StatusDef[]>([]);
  const [label, setLabel] = useState("");
  const [highlightCodes, setHighlightCodes] = useState<string[]>([]);

  async function load() {
    const res = await apiRequest("GET", `/api/statuses/${entity}`);
    const json = await res.json();
    setRows(json.data || []);
    if (entity === "ORDER") {
      const settingsRes = await apiRequest("GET", "/api/dashboard/highlight-settings");
      const settingsJson = await settingsRes.json();
      setHighlightCodes(settingsJson?.data?.statusCodes || []);
    }
  }

  useEffect(() => { load(); }, [entity]);

  async function createStatus() {
    if (!label.trim()) return;
    await apiRequest("POST", `/api/statuses/${entity}`, { label });
    setLabel("");
    await load();
  }

  async function updateStatus(id: number, patch: Record<string, unknown>) {
    await apiRequest("PATCH", `/api/statuses/${entity}/${id}`, patch);
    await load();
  }


  async function toggleHighlight(code: string, checked: boolean) {
    const next = checked ? Array.from(new Set([...highlightCodes, code])) : highlightCodes.filter((c) => c !== code);
    if (!next.length) return;
    setHighlightCodes(next);
    await apiRequest("PUT", "/api/dashboard/highlight-settings", { statusCodes: next });
    await load();
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">Estados</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={entity} onValueChange={(v) => setEntity(v as any)}>
          <TabsList>
            <TabsTrigger value="ORDER">Pedidos</TabsTrigger>
            <TabsTrigger value="PRODUCT">Productos</TabsTrigger>
            <TabsTrigger value="DELIVERY">Delivery</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nuevo estado" />
          <Button onClick={createStatus}>Crear</Button>
        </div>


        {entity === "ORDER" ? (
          <div className="space-y-2 border rounded p-3">
            <p className="text-sm font-medium">Estados destacados en Dashboard</p>
            <p className="text-xs text-muted-foreground">Se mostrarán hasta 5 pedidos por estado destacado.</p>
            <div className="space-y-1">
              {rows.filter((r) => r.isActive).map((s) => (
                <label key={`hl-${s.id}`} className="flex items-center justify-between text-sm">
                  <span>{s.label}</span>
                  <Switch checked={highlightCodes.includes(s.code)} onCheckedChange={(checked) => toggleHighlight(s.code, checked)} />
                </label>
              ))}
            </div>
          </div>
        ) : null}


        <div className="space-y-2">
          {rows.map((s) => (
            <div key={s.id} className="flex items-center gap-2 border rounded p-2">
              <div className="w-3 h-3 rounded-full" style={{ background: s.color || "#9CA3AF" }} />
              <Input value={s.label} onChange={(e) => updateStatus(s.id, { label: e.target.value })} />
              <Badge variant="secondary">{s.code}</Badge>
              {s.isDefault ? <Badge>Default</Badge> : <Button size="sm" variant="outline" onClick={() => apiRequest("POST", `/api/statuses/${entity}/${s.id}/set-default`, {}).then(load)}>Set default</Button>}
              <div className="flex items-center gap-1 text-xs">Activo<Switch checked={s.isActive} onCheckedChange={(checked) => updateStatus(s.id, { isActive: checked })} /></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
