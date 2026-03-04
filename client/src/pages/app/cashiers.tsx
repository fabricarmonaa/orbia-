import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePlan } from "@/lib/plan";
import { useToast } from "@/hooks/use-toast";
import { useTenantLimits } from "@/lib/tenant-limits";

interface CashierRow {
  id: number;
  name: string;
  branch_id: number | null;
  active: boolean;
  is_approved?: boolean;
  approved_at?: string | null;
  revoked_at?: string | null;
}

export default function CashiersPage() {
  const { plan, hasFeature } = usePlan();
  const { data: limitsData } = useTenantLimits();
  const { toast } = useToast();
  const [rows, setRows] = useState<CashierRow[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  const enabled = hasFeature("cashiers");
  const maxCashiers = limitsData?.limits.maxCashiers ?? plan?.limits?.cashiers_max ?? 0;
  const cashiersCount = Math.max(rows.length, limitsData?.usage.cashiersCount ?? 0);
  const atLimit = maxCashiers >= 0 && cashiersCount >= maxCashiers;

  async function load() {
    const res = await apiRequest("GET", "/api/cashiers");
    const json = await res.json();
    setRows(json.data || []);
  }

  async function createCashier() {
    try {
      const res = await apiRequest("POST", "/api/cashiers", { name, pin, branch_id: null });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "No se pudo crear el cajero");
      setName("");
      setPin("");
      toast({ title: "Cajero creado" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function toggleActive(row: CashierRow, active: boolean) {
    await apiRequest("PATCH", `/api/cashiers/${row.id}`, { active });
    await load();
  }

  async function remove(row: CashierRow) {
    await apiRequest("DELETE", `/api/cashiers/${row.id}`);
    await load();
  }

  async function approve(row: CashierRow) {
    try {
      const res = await apiRequest("POST", `/api/cashiers/${row.id}/approve`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo aprobar el cajero");
      toast({ title: "Cajero aprobado" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "No se pudo aprobar el cajero", variant: "destructive" });
    }
  }

  async function revoke(row: CashierRow) {
    try {
      const res = await apiRequest("POST", `/api/cashiers/${row.id}/revoke`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo revocar el cajero");
      toast({ title: "Cajero revocado" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "No se pudo revocar el cajero", variant: "destructive" });
    }
  }

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  if (!enabled) {
    return <Card><CardHeader><CardTitle>Cajeros</CardTitle></CardHeader><CardContent>Disponible en planes Pro y Escala.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader><CardTitle>Cajeros</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={atLimit} /></div>
          <div><Label>PIN (4-8)</Label><Input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={8} disabled={atLimit} /></div>
          <div className="flex items-end">
            <Button onClick={createCashier} disabled={!name || pin.length < 4 || atLimit} title={atLimit ? `Límite de ${maxCashiers} cajeros alcanzado` : undefined}>
              Crear
            </Button>
          </div>
        </div>
        {atLimit && (
          <div className="p-3 bg-secondary/20 text-sm text-muted-foreground rounded-md border border-border">
            Alcanzaste el límite de <strong>{maxCashiers}</strong> cajeros de tu plan. Mejorá tu plan para agregar más.
          </div>
        )}
        {maxCashiers >= 0 && (
          <div className="text-xs text-muted-foreground">Te quedan {Math.max(maxCashiers - cashiersCount, 0)} de {maxCashiers} cajeros disponibles.</div>
        )}
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="border rounded p-2 flex items-center justify-between">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.branch_id ? `Sucursal #${row.branch_id}` : "CENTRAL"}</p>
                <p className="text-xs text-muted-foreground">
                  {row.is_approved ? "Aprobado" : "Pendiente de aprobación"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {!row.is_approved ? (
                  <Button size="sm" onClick={() => approve(row)}>Aprobar</Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => revoke(row)}>Revocar</Button>
                )}
                <Switch checked={row.active} onCheckedChange={(active) => toggleActive(row, active)} />
                <Button variant="destructive" size="sm" onClick={() => remove(row)}>Eliminar</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
