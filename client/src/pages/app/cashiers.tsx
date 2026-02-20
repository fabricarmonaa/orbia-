import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePlan } from "@/lib/plan";
import { useToast } from "@/hooks/use-toast";

interface CashierRow {
  id: number;
  name: string;
  branch_id: number | null;
  active: boolean;
}

export default function CashiersPage() {
  const { plan } = usePlan();
  const { toast } = useToast();
  const [rows, setRows] = useState<CashierRow[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  const enabled = ["PROFESIONAL", "ESCALA"].includes((plan?.planCode || "").toUpperCase());

  async function load() {
    const res = await apiRequest("GET", "/api/cashiers");
    const json = await res.json();
    setRows(json.data || []);
  }

  async function createCashier() {
    await apiRequest("POST", "/api/cashiers", { name, pin, branch_id: null });
    setName("");
    setPin("");
    toast({ title: "Cajero creado" });
    await load();
  }

  async function toggleActive(row: CashierRow, active: boolean) {
    await apiRequest("PATCH", `/api/cashiers/${row.id}`, { active });
    await load();
  }

  async function remove(row: CashierRow) {
    await apiRequest("DELETE", `/api/cashiers/${row.id}`);
    await load();
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
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>PIN (4-8)</Label><Input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={8} /></div>
          <div className="flex items-end"><Button onClick={createCashier} disabled={!name || pin.length < 4}>Crear</Button></div>
        </div>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="border rounded p-2 flex items-center justify-between">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.branch_id ? `Sucursal #${row.branch_id}` : "CENTRAL"}</p>
              </div>
              <div className="flex items-center gap-3">
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
