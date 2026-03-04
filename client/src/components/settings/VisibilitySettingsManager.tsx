import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useVisibilitySettings } from "@/hooks/use-visibility-settings";
import type { EntityType } from "@/hooks/use-entity-fields";
import { apiRequest } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const ORDER_FLAGS = [
  { key: "showOrderNumber", label: "Mostrar número de pedido" },
  { key: "showType", label: "Mostrar tipo" },
  { key: "showCreatedUpdated", label: "Mostrar creado/actualizado" },
  { key: "showFullHistory", label: "Mostrar historial completo" },
  { key: "showHistoryTimestamps", label: "Mostrar fecha y hora en historial" },
  { key: "showTosButton", label: "Mostrar botón de términos y condiciones" },
];

const GENERIC_FLAGS = [
  { key: "showInternal", label: "Mostrar en vista interna" },
  { key: "showTicket", label: "Mostrar en ticket/PDF" },
];

export function VisibilitySettingsManager({ entityType }: { entityType: EntityType }) {
  const { data, setData, loading, error } = useVisibilitySettings(entityType);
  const { toast } = useToast();
  const flags = entityType === "ORDER" ? ORDER_FLAGS : GENERIC_FLAGS;

  async function save() {
    try {
      await apiRequest("PUT", `/api/visibility/${entityType}`, { settings: data });
      toast({ title: "Visibilidad guardada" });
    } catch (err: any) {
      toast({ title: "No se pudo guardar", description: err?.message, variant: "destructive" });
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando visibilidad…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <Card>
      <CardHeader><CardTitle>Visibilidad · {entityType}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {flags.map((flag) => (
          <div key={flag.key} className="flex items-center justify-between border rounded p-2">
            <span className="text-sm">{flag.label}</span>
            <Switch checked={Boolean(data[flag.key])} onCheckedChange={(checked) => setData((prev) => ({ ...prev, [flag.key]: checked }))} />
          </div>
        ))}
        <Button onClick={save}>Guardar visibilidad</Button>
      </CardContent>
    </Card>
  );
}
