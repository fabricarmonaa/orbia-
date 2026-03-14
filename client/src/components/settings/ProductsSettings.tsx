import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Archive, ChevronDown, ChevronUp, Plus } from "lucide-react";

type FieldOption = { value: string; label?: string; inactive?: boolean };

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
  archivedAt?: string | null;
  config: {
    options?: FieldOption[];
    showInForm?: boolean;
    showInTable?: boolean;
    showInDetail?: boolean;
    showInExport?: boolean;
    showInDocument?: boolean;
    placeholder?: string;
  };
};

const FIELD_TYPES = [
  { value: "TEXT", label: "Texto corto" },
  { value: "TEXTAREA", label: "Texto largo" },
  { value: "NUMBER", label: "Número entero" },
  { value: "DECIMAL", label: "Decimal" },
  { value: "BOOLEAN", label: "Checkbox (Sí/No)" },
  { value: "DATE", label: "Fecha" },
  { value: "SELECT", label: "Select simple" },
  { value: "MULTISELECT", label: "Multiselect" },
  { value: "COLOR", label: "Etiqueta/Color" },
];

const FILTER_TYPES = [
  { value: "EXACT", label: "Exacto" },
  { value: "FACET", label: "Faceta (con contadores)" },
  { value: "RANGE", label: "Rango numérico" },
];

type FieldForm = {
  label: string;
  fieldKey: string;
  fieldType: string;
  required: boolean;
  isActive: boolean;
  isFilterable: boolean;
  filterType: string;
  sortOrder: number;
  optionsRaw: string;
  showInForm: boolean;
  showInTable: boolean;
  showInDetail: boolean;
  showInExport: boolean;
  showInDocument: boolean;
};

const emptyForm: FieldForm = {
  label: "",
  fieldKey: "",
  fieldType: "TEXT",
  required: false,
  isActive: true,
  isFilterable: false,
  filterType: "EXACT",
  sortOrder: 0,
  optionsRaw: "",
  showInForm: true,
  showInTable: false,
  showInDetail: true,
  showInExport: false,
  showInDocument: false,
};

function fieldToForm(f: ProductCustomFieldDefinition): FieldForm {
  const opts = Array.isArray(f.config?.options) ? f.config.options : [];
  return {
    label: f.label,
    fieldKey: f.fieldKey,
    fieldType: f.fieldType,
    required: f.required,
    isActive: f.isActive,
    isFilterable: f.isFilterable,
    filterType: f.filterType || "EXACT",
    sortOrder: f.sortOrder ?? 0,
    optionsRaw: opts.map((o) => o.label || o.value).join("\n"),
    showInForm: f.config?.showInForm !== false,
    showInTable: f.config?.showInTable === true,
    showInDetail: f.config?.showInDetail !== false,
    showInExport: f.config?.showInExport === true,
    showInDocument: f.config?.showInDocument === true,
  };
}

function formToPayload(form: FieldForm) {
  const needsOptions = ["SELECT", "MULTISELECT", "COLOR"].includes(form.fieldType);
  const options: FieldOption[] = needsOptions
    ? form.optionsRaw
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((v) => ({ value: v, label: v }))
    : [];
  return {
    label: form.label,
    fieldKey: form.fieldKey,
    fieldType: form.fieldType,
    required: form.required,
    isActive: form.isActive,
    isFilterable: form.isFilterable,
    filterType: form.filterType,
    sortOrder: form.sortOrder,
    config: {
      options,
      showInForm: form.showInForm,
      showInTable: form.showInTable,
      showInDetail: form.showInDetail,
      showInExport: form.showInExport,
      showInDocument: form.showInDocument,
    },
  };
}

function FieldFormPanel({
  form,
  onChange,
  onSubmit,
  submitText,
  submitting,
  editingTypeWarning,
}: {
  form: FieldForm;
  onChange: (f: FieldForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitText: string;
  submitting: boolean;
  editingTypeWarning?: boolean;
}) {
  const needsOptions = ["SELECT", "MULTISELECT", "COLOR"].includes(form.fieldType);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="bg-muted/30 border rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">1. Configuración básica</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">Definí el nombre y qué tipo de información querés guardar.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nombre del campo</Label>
            <Input required value={form.label} onChange={(e) => onChange({ ...form, label: e.target.value })} placeholder="Ej: Material, Talle, Marca..." />
          </div>

          <div className="space-y-2">
            <Label>¿Qué tipo de respuesta esperás?</Label>
            <Select value={form.fieldType} onValueChange={(v) => onChange({ ...form, fieldType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editingTypeWarning && (
              <p className="text-[11px] text-amber-600 mt-1">El tipo está bloqueado porque ya hay productos usando este campo.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 flex flex-col justify-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={form.required} onCheckedChange={(v) => onChange({ ...form, required: !!v })} />
              <div>
                <span className="text-sm font-medium">Hacer obligatorio</span>
                <p className="text-[11px] text-muted-foreground">No se podrá guardar el producto sin este dato.</p>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer mt-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => onChange({ ...form, isActive: !!v })} />
              <div>
                <span className="text-sm font-medium">Campo activo</span>
                <p className="text-[11px] text-muted-foreground">Ocultalo si dejás de usarlo temporalmente.</p>
              </div>
            </label>
          </div>
          
          <div className="space-y-2">
            <Label>Identificador interno del sistema</Label>
            <Input
              required
              value={form.fieldKey}
              onChange={(e) => onChange({ ...form, fieldKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              placeholder="ej: material_principal"
              className="font-mono text-sm bg-muted/50"
            />
            <p className="text-[11px] text-muted-foreground">Se autocompleta. Solo caracteres permitidos.</p>
          </div>
        </div>

        {needsOptions && (
          <div className="space-y-2 pt-2 border-t">
            <Label>Opciones posibles para elegir</Label>
            <p className="text-[12px] text-muted-foreground mb-2">Escribí una opción por línea. Presioná Enter para separar.</p>
            <textarea
              className="w-full min-h-[120px] rounded-md border p-3 text-sm bg-background focus:ring-1 focus:ring-ring outline-none"
              value={form.optionsRaw}
              onChange={(e) => onChange({ ...form, optionsRaw: e.target.value })}
              placeholder={"Algodón\nCuero\nSintético"}
            />
          </div>
        )}
      </div>

      <div className="bg-muted/10 border rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">2. Comportamiento especial</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">Controlá cómo se comporta este campo al filtrar y visualizar datos.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 gap-y-5">
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={form.isFilterable} onCheckedChange={(v) => onChange({ ...form, isFilterable: !!v })} />
              <span className="text-sm font-medium text-primary">Permitir filtrar por este campo</span>
            </label>

            <div className={`space-y-1.5 transition-opacity ${form.isFilterable ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <Label className="text-[12px]">Formato del filtro en la lista</Label>
              <Select value={form.filterType} onValueChange={(v) => onChange({ ...form, filterType: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FILTER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Orden visual</Label>
            <Input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => onChange({ ...form, sortOrder: Number(e.target.value) })}
              className="w-24"
            />
            <p className="text-[11px] text-muted-foreground">Los números más bajos aparecen primero.</p>
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">3. Lugares donde se muestra</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">Desmarcá lo que no quieras ver para evitar saturar las grillas.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6 text-[13.5px] bg-muted/5 p-3 rounded-md">
          <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.showInForm} onCheckedChange={(v) => onChange({ ...form, showInForm: !!v })} /> En los formularios (crear/editar)</label>
          <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.showInDetail} onCheckedChange={(v) => onChange({ ...form, showInDetail: !!v })} /> En la ficha de detalle (lectura)</label>
          <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.showInTable} onCheckedChange={(v) => onChange({ ...form, showInTable: !!v })} /> En las tablas / listados generales</label>
          <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.showInExport} onCheckedChange={(v) => onChange({ ...form, showInExport: !!v })} /> En exportaciones de Excel</label>
          <label className="flex items-center gap-2 cursor-pointer"><Switch checked={form.showInDocument} onCheckedChange={(v) => onChange({ ...form, showInDocument: !!v })} /> En documentos (remitos, presupuestos)</label>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={submitting} className="min-w-[150px]">
          {submitting ? "Guardando..." : submitText}
        </Button>
      </div>
    </form>
  );
}

export function ProductsSettings() {
  const { toast } = useToast();
  const [fields, setFields] = useState<ProductCustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FieldForm>(emptyForm);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Edit state
  const [editField, setEditField] = useState<ProductCustomFieldDefinition | null>(null);
  const [editForm, setEditForm] = useState<FieldForm>(emptyForm);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete/archive state
  const [deleteTarget, setDeleteTarget] = useState<ProductCustomFieldDefinition | null>(null);
  const [deleteUsageCount, setDeleteUsageCount] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/products/custom-fields");
      const json = await res.json();
      setFields(json.data || []);
    } catch (err: any) {
      toast({ title: "Error al cargar campos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createField(e: React.FormEvent) {
    e.preventDefault();
    setCreateSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/products/custom-fields", formToPayload(createForm));
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || "No se pudo crear el campo");
      }
      setCreateForm(emptyForm);
      setCreateOpen(false);
      toast({ title: "Campo creado correctamente" });
      await load();
    } catch (err: any) {
      toast({ title: "Error al crear campo", description: err.message, variant: "destructive" });
    } finally {
      setCreateSubmitting(false);
    }
  }

  function openEdit(field: ProductCustomFieldDefinition) {
    setEditField(field);
    setEditForm(fieldToForm(field));
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editField) return;
    setEditSubmitting(true);
    try {
      const res = await apiRequest("PUT", `/api/products/custom-fields/${editField.id}`, formToPayload(editForm));
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "No se pudo guardar el campo");
      }
      setEditField(null);
      toast({ title: "Campo actualizado correctamente" });
      await load();
    } catch (err: any) {
      toast({ title: "Error al guardar campo", description: err.message, variant: "destructive" });
    } finally {
      setEditSubmitting(false);
    }
  }

  async function openDelete(field: ProductCustomFieldDefinition) {
    setDeleteTarget(field);
    setDeleteUsageCount(null);
    try {
      const res = await apiRequest("GET", `/api/products/custom-fields/${field.id}/usage`);
      const json = await res.json();
      setDeleteUsageCount(json?.data?.count ?? 0);
    } catch {
      setDeleteUsageCount(0);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await apiRequest("DELETE", `/api/products/custom-fields/${deleteTarget.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo eliminar el campo");
      if (json?.data?.archived) {
        toast({ title: "Campo archivado", description: json.data.message });
      } else {
        toast({ title: "Campo eliminado definitivamente" });
      }
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      toast({ title: "Error al eliminar campo", description: err.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  }

  async function toggleActive(field: ProductCustomFieldDefinition) {
    try {
      const res = await apiRequest("PUT", `/api/products/custom-fields/${field.id}`, { isActive: !field.isActive });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || "No se pudo actualizar");
      }
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  const activeFields = fields.filter((f) => !f.archivedAt);

  return (
    <div className="space-y-4">
      {/* Create form */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Campos personalizados de productos</CardTitle>
            <Button size="sm" onClick={() => setCreateOpen((v) => !v)}>
              <Plus className="h-4 w-4 mr-1" />
              {createOpen ? "Cancelar" : "Nuevo campo"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Creá datos personalizados para adaptar Productos a tu negocio (talle, color, material, composición, etc).
          </p>
        </CardHeader>
        {createOpen && (
          <CardContent>
            <FieldFormPanel
              form={createForm}
              onChange={setCreateForm}
              onSubmit={createField}
              submitText="Crear campo"
              submitting={createSubmitting}
            />
          </CardContent>
        )}
      </Card>

      {/* List of existing fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Campos creados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : activeFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no creaste campos personalizados. Empezá con “Nuevo campo”.</p>
          ) : (
            activeFields.map((f) => (
              <FieldRow
                key={f.id}
                field={f}
                isEditing={editField?.id === f.id}
                editForm={editForm}
                editSubmitting={editSubmitting}
                onEdit={() => openEdit(f)}
                onCancelEdit={() => setEditField(null)}
                onSaveEdit={saveEdit}
                onEditFormChange={setEditForm}
                onToggleActive={() => toggleActive(f)}
                onDelete={() => openDelete(f)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editField} onOpenChange={(o) => { if (!o) setEditField(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar campo: {editField?.label}</DialogTitle>
          </DialogHeader>
          {editField && (
            <FieldFormPanel
              form={editForm}
              onChange={setEditForm}
              onSubmit={saveEdit}
              submitText="Guardar cambios"
              submitting={editSubmitting}
              editingTypeWarning={true}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete/archive confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteUsageCount === null
                ? "¿Eliminar campo?"
                : deleteUsageCount > 0
                  ? `Archivar campo "${deleteTarget?.label}"`
                  : `Eliminar campo "${deleteTarget?.label}"`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUsageCount === null ? (
                "Verificando datos..."
              ) : deleteUsageCount > 0 ? (
                <>
                  <span className="font-medium text-amber-700">
                    Este campo tiene datos en {deleteUsageCount} producto(s).
                  </span>
                  <br />
                  Se archivará: no aparecerá más en formularios ni filtros, pero los datos existentes se <strong>preservan completamente</strong>.
                  <br /><br />
                  Si necesitás eliminar los datos también, deberás editar cada producto manualmente.
                </>
              ) : (
                "Este campo no tiene datos asociados. Se eliminará definitivamente. Esta acción no se puede deshacer."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLoading || deleteUsageCount === null}
              onClick={confirmDelete}
              className={deleteUsageCount && deleteUsageCount > 0 ? "bg-amber-600 hover:bg-amber-700" : "bg-destructive hover:bg-destructive/90"}
            >
              {deleteLoading
                ? "Procesando..."
                : deleteUsageCount && deleteUsageCount > 0
                  ? "Sí, archivar campo"
                  : "Sí, eliminar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FieldRow({
  field,
  isEditing,
  editForm,
  editSubmitting,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onEditFormChange,
  onToggleActive,
  onDelete,
}: {
  field: ProductCustomFieldDefinition;
  isEditing: boolean;
  editForm: FieldForm;
  editSubmitting: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (e: React.FormEvent) => void;
  onEditFormChange: (f: FieldForm) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const opts = Array.isArray(field.config?.options) ? field.config.options : [];
  const activeOpts = opts.filter((o) => !o.inactive);

  return (
    <div className={`border rounded-md transition-colors ${field.isActive ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{field.label}</span>
            <code className="text-xs bg-muted px-1 rounded">{field.fieldKey}</code>
            <Badge variant="outline" className="text-xs">{FIELD_TYPES.find((t) => t.value === field.fieldType)?.label || field.fieldType}</Badge>
            {field.isFilterable && <Badge variant="secondary" className="text-xs">Filtro: {field.filterType}</Badge>}
            {field.required && <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Obligatorio</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {field.config?.showInTable && <span>Listado</span>}
            {field.config?.showInForm !== false && <span>Formulario</span>}
            {field.config?.showInDetail !== false && <span>Detalle</span>}
            {field.config?.showInExport && <span>Exportación</span>}
            {activeOpts.length > 0 && <span>{activeOpts.length} opciones</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <Switch checked={field.isActive} onCheckedChange={onToggleActive} />
          </label>
          <Button size="icon" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {expanded && activeOpts.length > 0 && (
        <div className="border-t px-3 py-2">
          <p className="text-xs text-muted-foreground font-medium mb-1">Opciones:</p>
          <div className="flex flex-wrap gap-1">
            {activeOpts.map((opt) => (
              <Badge key={opt.value} variant="secondary" className="text-xs">{opt.label || opt.value}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
