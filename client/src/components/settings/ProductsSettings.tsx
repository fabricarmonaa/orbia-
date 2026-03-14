import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type ProductCustomFieldDefinition = {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  sortOrder: number;
  isActive: boolean;
  isFilterable: boolean;
  filterType: string;
  config: {
    options?: Array<{ value: string; label?: string }>;
    showInForm?: boolean;
    showInTable?: boolean;
    showInDetail?: boolean;
    showInExport?: boolean;
    showInDocument?: boolean;
  };
};

const empty = {
  label: "",
  fieldKey: "",
  fieldType: "TEXT",
  required: false,
  isActive: true,
  isFilterable: false,
  filterType: "EXACT",
  optionsRaw: "",
  showInForm: true,
  showInTable: false,
  showInDetail: true,
  showInExport: false,
  showInDocument: false,
};

export function ProductsSettings() {
  const { toast } = useToast();
  const [fields, setFields] = useState<ProductCustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/products/custom-fields");
      const json = await res.json();
      setFields(json.data || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function createField(e: React.FormEvent) {
    e.preventDefault();
    try {
      const options = form.optionsRaw
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((value) => ({ value, label: value }));

      await apiRequest("POST", "/api/products/custom-fields", {
        label: form.label,
        fieldKey: form.fieldKey,
        fieldType: form.fieldType,
        required: form.required,
        isActive: form.isActive,
        isFilterable: form.isFilterable,
        filterType: form.filterType,
        config: {
          options,
          showInForm: form.showInForm,
          showInTable: form.showInTable,
          showInDetail: form.showInDetail,
          showInExport: form.showInExport,
          showInDocument: form.showInDocument,
        },
      });
      setForm(empty);
      toast({ title: "Campo creado" });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function toggleActive(field: ProductCustomFieldDefinition, isActive: boolean) {
    try {
      await apiRequest("PUT", `/api/products/custom-fields/${field.id}`, { isActive });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Campos personalizados de productos</CardTitle></CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={createField}>
            <div className="space-y-2"><Label>Nombre visible</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Clave interna</Label><Input value={form.fieldKey} onChange={(e) => setForm({ ...form, fieldKey: e.target.value })} placeholder="ej: color" required /></div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.fieldType} onValueChange={(v) => setForm({ ...form, fieldType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">Texto corto</SelectItem>
                  <SelectItem value="TEXTAREA">Texto largo</SelectItem>
                  <SelectItem value="NUMBER">Número</SelectItem>
                  <SelectItem value="DECIMAL">Decimal</SelectItem>
                  <SelectItem value="BOOLEAN">Checkbox</SelectItem>
                  <SelectItem value="DATE">Fecha</SelectItem>
                  <SelectItem value="SELECT">Select</SelectItem>
                  <SelectItem value="MULTISELECT">Multiselect</SelectItem>
                  <SelectItem value="COLOR">Color/Etiqueta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Filtro</Label>
              <Select value={form.filterType} onValueChange={(v) => setForm({ ...form, filterType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXACT">Exacto</SelectItem>
                  <SelectItem value="FACET">Faceta/contador</SelectItem>
                  <SelectItem value="RANGE">Rango</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.fieldType === "SELECT" || form.fieldType === "MULTISELECT" || form.fieldType === "COLOR") && (
              <div className="md:col-span-2 space-y-2">
                <Label>Opciones (una por línea)</Label>
                <textarea className="w-full min-h-[90px] rounded border p-2 text-sm" value={form.optionsRaw} onChange={(e) => setForm({ ...form, optionsRaw: e.target.value })} />
              </div>
            )}
            <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <label className="flex items-center gap-2"><Switch checked={form.required} onCheckedChange={(v) => setForm({ ...form, required: !!v })} />Obligatorio</label>
              <label className="flex items-center gap-2"><Switch checked={form.isFilterable} onCheckedChange={(v) => setForm({ ...form, isFilterable: !!v })} />Usar filtro</label>
              <label className="flex items-center gap-2"><Switch checked={form.showInForm} onCheckedChange={(v) => setForm({ ...form, showInForm: !!v })} />Visible formulario</label>
              <label className="flex items-center gap-2"><Switch checked={form.showInTable} onCheckedChange={(v) => setForm({ ...form, showInTable: !!v })} />Visible tabla</label>
              <label className="flex items-center gap-2"><Switch checked={form.showInDetail} onCheckedChange={(v) => setForm({ ...form, showInDetail: !!v })} />Visible detalle</label>
              <label className="flex items-center gap-2"><Switch checked={form.showInExport} onCheckedChange={(v) => setForm({ ...form, showInExport: !!v })} />Visible exportación</label>
              <label className="flex items-center gap-2"><Switch checked={form.showInDocument} onCheckedChange={(v) => setForm({ ...form, showInDocument: !!v })} />Visible documento</label>
            </div>
            <div className="md:col-span-2"><Button type="submit">Crear campo</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Campos actuales</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading ? <p className="text-sm text-muted-foreground">Cargando...</p> : fields.length === 0 ? <p className="text-sm text-muted-foreground">Sin campos personalizados.</p> : fields.map((f) => (
            <div key={f.id} className="border rounded p-2 flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{f.label} <span className="text-muted-foreground">({f.fieldKey})</span></p>
                <p className="text-xs text-muted-foreground">{f.fieldType} · filtro: {f.isFilterable ? f.filterType : "no"} · tabla: {f.config?.showInTable ? "sí" : "no"}</p>
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={f.isActive} onCheckedChange={(v) => toggleActive(f, !!v)} />Activo</label>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
