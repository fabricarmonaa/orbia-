import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { usePlan } from "@/lib/plan";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

interface CashierRow {
  id: number;
  name: string;
  branch_id: number | null;
  active: boolean;
}

export default function CashiersPage() {
  const { plan, getLimit } = usePlan();
  const { toast } = useToast();
  const [rows, setRows] = useState<CashierRow[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  const enabled = [["PROFESIONAL", "ESCALA"].includes((plan?.planCode || "").toUpperCase()), plan !== null].every(Boolean);

  // max_cashiers comes from plan.limits (normalized in auth.ts)
  const maxCashiers = getLimit("max_cashiers");
  const activeCashiers = rows.filter((r) => r.active).length;
  const atLimit = maxCashiers >= 0 && activeCashiers >= maxCashiers;

  async function load() {
    try {
      const res = await apiRequest("GET", "/api/cashiers");
      const json = await res.json();
      setRows(json.data || []);
    } catch {
      // silencioso
    }
  }

  async function createCashier() {
    try {
      const res = await apiRequest("POST", "/api/cashiers", { name, pin, branch_id: null });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Error al crear cajero");
      setName("");
      setPin("");
      toast({ title: "Cajero creado" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function toggleActive(row: CashierRow, active: boolean) {
    try {
      await apiRequest("PATCH", `/api/cashiers/${row.id}`, { active });
      await load();
    } catch {
      toast({ title: "No se pudo actualizar el cajero", variant: "destructive" });
    }
  }

  async function remove(row: CashierRow) {
    try {
      await apiRequest("DELETE", `/api/cashiers/${row.id}`);
      await load();
    } catch {
      toast({ title: "No se pudo eliminar el cajero", variant: "destructive" });
    }
  }

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  if (plan !== null && !enabled) {
    return (
      <Card>
        <CardHeader><CardTitle>Cajeros</CardTitle></CardHeader>
        <CardContent>Disponible en planes Profesional y PyMe.</CardContent>
      </Card>
    );
  }

  const upgradeUrl = `https://wa.me/5492236979026?text=${encodeURIComponent(`Hola! Quiero mejorar mi plan para tener más cajeros`)}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>Cajeros</CardTitle>
          {maxCashiers >= 0 && (
            <span className="text-xs text-muted-foreground">
              {activeCashiers}/{maxCashiers} activos
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {atLimit && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Llegaste al máximo de cajeros de tu plan ({maxCashiers})
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                Con el plan{" "}
                <Badge variant="secondary" className="text-xs">{plan?.name}</Badge>{" "}
                podés tener hasta {maxCashiers} cajero{maxCashiers !== 1 ? "s" : ""} activos a la vez.{" "}
                <a href={upgradeUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                  Subir de plan →
                </a>
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={atLimit}
              data-testid="input-cashier-name"
            />
          </div>
          <div>
            <Label>PIN (4-8 dígitos)</Label>
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              maxLength={8}
              disabled={atLimit}
              data-testid="input-cashier-pin"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={createCashier}
              disabled={!name || pin.length < 4 || atLimit}
              title={atLimit ? `Límite de ${maxCashiers} cajeros alcanzado en tu plan` : undefined}
              data-testid="button-create-cashier"
            >
              Crear cajero
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="border rounded p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.branch_id ? `Sucursal #${row.branch_id}` : "CENTRAL"} — {row.active ? "Activo" : "Inactivo"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={row.active}
                  onCheckedChange={(active) => toggleActive(row, active)}
                  disabled={!row.active && atLimit}
                  title={!row.active && atLimit ? `No podés activar más cajeros: límite de ${maxCashiers} alcanzado` : undefined}
                />
                <Button variant="destructive" size="sm" onClick={() => remove(row)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay cajeros creados. ¡Creá el primero!
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
