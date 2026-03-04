import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/auth";
import { useEntityFields, type EntityType } from "@/hooks/use-entity-fields";
import { useOptionLists } from "@/hooks/use-option-lists";
import { normalizeFieldKey } from "@shared/validators/fields";

const FIELD_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTISELECT", "MONEY", "FILE"];

export function FieldsManager({ entityType }: { entityType: EntityType }) {
  const { data, loading, error, reload } = useEntityFields(entityType);
  const { data: optionLists } = useOptionLists();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldType, setFieldType] = useState("TEXT");
  const [required, setRequired] = useState(false);
  const [optionListKey, setOptionListKey] = useState<string>("");

  const sorted = useMemo(() => [...data].sort((a, b) => a.sortOrder - b.sortOrder), [data]);

  async function createField() {
    try {
      const config = fieldType === "SELECT" || fieldType === "MULTISELECT" ? { optionListKey } : {};
      await apiRequest("POST", `/api/fields/${entityType}`, { label, fieldKey: normalizeFieldKey(fieldKey || label), fieldType, required, config });
      toast({ title: "Campo creado" });
      setLabel("");
      setFieldKey("");
      setFieldType("TEXT");
      setRequired(false);
      setOptionListKey("");
      await reload();
    } catch (err: any) {
      toast({ title: "No se pudo crear el campo", description: err?.message, variant: "destructive" });
    }
  }

  async function toggleActive(id: number, active: boolean) {
    try {
      await apiRequest("POST", `/api/fields/${entityType}/${id}/${active ? "deactivate" : "reactivate"}`);
      await reload();
    } catch (err: any) {
      toast({ title: "No se pudo actualizar estado", description: err?.message, variant: "destructive" });
    }
  }

  async function reorder(id: number, direction: -1 | 1) {
    const index = sorted.findIndex((x) => x.id === id);
    const target = sorted[index + direction];
    if (!target) return;
    const reordered = [...sorted];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    try {
      await apiRequest("POST", `/api/fields/${entityType}/reorder`, { orderedFieldIds: reordered.map((x) => x.id) });
      await reload();
    } catch (err: any) {
      toast({ title: "No se pudo reordenar", description: err?.message, variant: "destructive" });
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando campos…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <Card>
      <CardHeader><CardTitle>Campos dinámicos · {entityType}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <Input placeholder="Label" value={label} onChange={(e) => { setLabel(e.target.value); if (!fieldKey) setFieldKey(normalizeFieldKey(e.target.value)); }} />
          <Input placeholder="Key" value={fieldKey} onChange={(e) => setFieldKey(normalizeFieldKey(e.target.value))} />
          <Select value={fieldType} onValueChange={setFieldType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          {(fieldType === "SELECT" || fieldType === "MULTISELECT") ? (
            <Select value={optionListKey} onValueChange={setOptionListKey}><SelectTrigger><SelectValue placeholder="Lista" /></SelectTrigger><SelectContent>{optionLists.map((l) => <SelectItem key={l.id} value={l.key}>{l.name}</SelectItem>)}</SelectContent></Select>
          ) : <div />}
          <div className="flex items-center gap-2"><Switch checked={required} onCheckedChange={setRequired} /><span className="text-sm">Requerido</span></div>
          <Button onClick={createField} disabled={!label.trim()}>Crear</Button>
        </div>

        <div className="space-y-2">
          {sorted.map((field) => (
            <div key={field.id} className="flex items-center justify-between rounded border p-2">
              <div>
                <div className="font-medium text-sm">{field.label} <span className="text-xs text-muted-foreground">({field.fieldKey})</span></div>
                <div className="text-xs text-muted-foreground">{field.fieldType} · {field.required ? "Requerido" : "Opcional"} · {field.isActive ? "Activo" : "Inactivo"}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => reorder(field.id, -1)}>↑</Button>
                <Button size="sm" variant="outline" onClick={() => reorder(field.id, 1)}>↓</Button>
                <Button size="sm" variant="outline" onClick={() => toggleActive(field.id, field.isActive)}>{field.isActive ? "Desactivar" : "Activar"}</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
