import { useEffect, useMemo, useState } from "react";
import { authFetch, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Pencil, Plus, Eye, EyeOff, Trash2 } from "lucide-react";
import { resolveFileFieldBehavior } from "@shared/order-fields";
import {
  canCreateMoreOrderPresets,
  getActiveOrderPresets,
  getEmptyOrderPresetFieldForm,
  pickVisibleTrackingDefault,
} from "./order-presets-ui";

type OrderType = { id: number; code: string; label: string; isActive: boolean };
type OrderPreset = { id: number; orderTypeId: number; code: string; label: string; isActive: boolean; sortOrder: number };
type OrderField = {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: "TEXT" | "TEXT_LONG" | "NUMBER" | "MONEY" | "FILE" | "CHECKBOX" | "SELECT" | "DATE" | "TIME" | "DATETIME";
  required: boolean;
  visibleInTracking: boolean;
  useInAgenda?: boolean;
  sortOrder: number;
  deletedAt?: string | null;
  config?: {
    allowedExtensions?: string[];
    options?: string[];
    affectsCustomers?: boolean;
    affectsCash?: boolean;
    affectsReports?: boolean;
    isCriticalField?: boolean;
    placeholder?: string;
    defaultValue?: string | number | null;
    currencyCode?: string;
    visibleInForm?: boolean;
    showWhenEmpty?: boolean;
    sectionLabel?: string;
    sectionOrder?: number;
    mediaMode?: "single" | "gallery" | "attachments";
    acceptMode?: "images" | "mixed";
    maxFiles?: number;
    expectedFiles?: number | null;
    trackingRender?: "grid" | "carousel" | "list";
  };
  isSystemDefault: boolean;
  isActive: boolean;
};

type ApiErr = { message: string; code?: string };

const FILE_EXTENSIONS = ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"] as const;


const CRITICAL_FIELD_HINTS: Record<string, { affectsCustomers?: boolean; affectsCash?: boolean; affectsReports?: boolean }> = {
  cliente: { affectsCustomers: true, affectsReports: true },
  customer: { affectsCustomers: true, affectsReports: true },
  customer_name: { affectsCustomers: true, affectsReports: true },
  telefono: { affectsCustomers: true },
  pago: { affectsCash: true, affectsReports: true },
  sena: { affectsCash: true, affectsReports: true },
  seña: { affectsCash: true, affectsReports: true },
  paid_amount: { affectsCash: true, affectsReports: true },
  total_amount: { affectsCash: true, affectsReports: true },
};

function normalizeOptions(values: string[]) {
  const map = new Map<string, string>();
  for (const v of values) {
    const trimmed = String(v || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase("es-AR");
    if (!map.has(key)) map.set(key, trimmed);
  }
  return Array.from(map.values());
}

function isCriticalField(field: OrderField | null) {
  if (!field) return false;
  const cfg = (field.config || {}) as any;
  if (cfg.isCriticalField) return true;
  const key = String(field.fieldKey || "").toLowerCase();
  return Boolean(field.isSystemDefault || CRITICAL_FIELD_HINTS[key]);
}

function getCriticalWarning(field: OrderField | null) {
  if (!field) return "";
  const key = String(field.fieldKey || "").toLowerCase();
  const cfg = (field.config || {}) as any;
  const hints = { ...(CRITICAL_FIELD_HINTS[key] || {}), affectsCustomers: Boolean(cfg.affectsCustomers || (CRITICAL_FIELD_HINTS[key] || {}).affectsCustomers), affectsCash: Boolean(cfg.affectsCash || (CRITICAL_FIELD_HINTS[key] || {}).affectsCash), affectsReports: Boolean(cfg.affectsReports || (CRITICAL_FIELD_HINTS[key] || {}).affectsReports) };
  const impacts = [
    hints.affectsCustomers ? "clientes" : null,
    hints.affectsCash ? "caja y cobros" : null,
    hints.affectsReports ? "reportes" : null,
  ].filter(Boolean);
  const suffix = impacts.length ? ` (${impacts.join(", ")})` : "";
  return `Si quitás o desactivás este campo, algunas funciones del sistema pueden dejar de funcionar correctamente${suffix}.`;
}

function isDefaultPreset(preset: OrderPreset | null) {
  return String(preset?.code || "").trim().toLowerCase() === "default";
}

function normalizeCreateFormForFieldType(
  current: {
    label: string;
    fieldType: "TEXT" | "TEXT_LONG" | "NUMBER" | "MONEY" | "FILE" | "CHECKBOX" | "SELECT" | "DATE" | "TIME" | "DATETIME";
    required: boolean;
    visibleInTracking: boolean;
    useInAgenda: boolean;
    placeholder: string;
    defaultValue: string;
    currencyCode: string;
    allowedExtensions: string[];
    mediaMode: "single" | "gallery" | "attachments";
    acceptMode: "images" | "mixed";
    maxFiles: string;
    expectedFiles: string;
    trackingRender: "grid" | "carousel" | "list";
    selectOptions: string[];
    sectionLabel: string;
    sectionOrder: string;
  },
  nextType: "TEXT" | "TEXT_LONG" | "NUMBER" | "MONEY" | "FILE" | "CHECKBOX" | "SELECT" | "DATE" | "TIME" | "DATETIME",
) {
  const next = { ...current, fieldType: nextType };

  if (nextType === "FILE") {
    next.placeholder = "";
    next.defaultValue = "";
    next.useInAgenda = false;
    next.allowedExtensions = next.allowedExtensions.length > 0 ? next.allowedExtensions : ["pdf", "jpg", "png", "jpeg"];
  }

  if (nextType !== "FILE" && next.allowedExtensions.length === 0) {
    next.allowedExtensions = ["pdf", "jpg", "png", "jpeg"];
  }

  if (nextType !== "SELECT" && nextType !== "CHECKBOX") {
    next.selectOptions = [""];
  }

  if (nextType !== "MONEY") {
    next.currencyCode = current.currencyCode || "ARS";
  }

  if (nextType !== "DATE" && nextType !== "DATETIME") {
    next.useInAgenda = false;
  }

  return next;
}


async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const raw = await res.text();
  const json = raw ? JSON.parse(raw) : {};
  if (!res.ok) {
    const err = json?.error || {};
    const message = err?.message || json?.message || json?.error || "Error inesperado";
    const code = err?.code || json?.code;
    const full = code ? `${message} (${code})` : message;
    throw { message: full, code } as ApiErr;
  }
  return json;
}

export function OrderPresetsSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const [loadingTypes, setLoadingTypes] = useState(true);
  const [types, setTypes] = useState<OrderType[]>([]);
  const [activeCode, setActiveCode] = useState<string>("PEDIDO");

  const [loadingPresets, setLoadingPresets] = useState(false);
  const [presets, setPresets] = useState<OrderPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<number | null>(null);

  const [loadingFields, setLoadingFields] = useState(false);
  const [fields, setFields] = useState<OrderField[]>([]);

  const [saving, setSaving] = useState(false);
  const [criticalDeactivateTarget, setCriticalDeactivateTarget] = useState<OrderField | null>(null);

  // Preset Create/Edit Modals
  const [openCreatePreset, setOpenCreatePreset] = useState(false);
  const [createPresetLabel, setCreatePresetLabel] = useState("");
  const [openEditPreset, setOpenEditPreset] = useState(false);
  const [editPresetTarget, setEditPresetTarget] = useState<OrderPreset | null>(null);
  const [editPresetLabel, setEditPresetLabel] = useState("");
  const [deletePresetTarget, setDeletePresetTarget] = useState<OrderPreset | null>(null);

  // Field Create/Edit Modals
  const [openCreateField, setOpenCreateField] = useState(false);
  const [openEditField, setOpenEditField] = useState(false);
  const [createForm, setCreateForm] = useState(getEmptyOrderPresetFieldForm);
  const [editTarget, setEditTarget] = useState<OrderField | null>(null);
  const [editForm, setEditForm] = useState({
    label: "",
    required: false,
    isActive: true,
    visibleInTracking: true,
    useInAgenda: false,
    placeholder: "",
    defaultValue: "",
    currencyCode: "ARS",
    allowedExtensions: [] as string[],
    mediaMode: "single" as "single" | "gallery" | "attachments",
    acceptMode: "mixed" as "images" | "mixed",
    maxFiles: "1",
    expectedFiles: "",
    trackingRender: "list" as "grid" | "carousel" | "list",
    selectOptions: [] as string[],
    sectionLabel: "",
    sectionOrder: "",
  });

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [fields]
  );

  const activePresets = useMemo(() => getActiveOrderPresets(presets), [presets]);

  async function loadTypes() {
    setLoadingTypes(true);
    try {
      const json = await apiJson<{ data: OrderType[] }>("/api/order-presets/types", { cache: "no-store" });
      const nextTypes = json.data || [];
      setTypes(nextTypes);
      if (nextTypes.length > 0 && !nextTypes.some((t) => t.code === activeCode)) {
        setActiveCode(nextTypes[0].code);
      }
    } catch (err: any) {
      toast({ title: "Error al cargar tipos", description: err?.message || "No se pudo cargar", variant: "destructive" });
    } finally {
      setLoadingTypes(false);
    }
  }

  async function loadPresets(code: string) {
    if (!code) return;
    setLoadingPresets(true);
    try {
      const json = await apiJson<{ data: OrderPreset[] }>(`/api/order-presets/types/${encodeURIComponent(code)}/presets`, { cache: "no-store" });
      const nextPresets = json.data || [];
      setPresets(nextPresets);
      if (nextPresets.length > 0) {
        const stillSelected = nextPresets.find((p) => p.id === activePresetId && p.isActive);
        const toSelect = stillSelected || nextPresets.find(p => p.code === "default" && p.isActive) || nextPresets.find(p => p.isActive) || nextPresets[0];
        setActivePresetId(toSelect.id);
      } else {
        setActivePresetId(null);
        setFields([]);
      }
    } catch (err: any) {
      toast({ title: "Error al cargar presets", description: err?.message || "No se pudo cargar", variant: "destructive" });
      setPresets([]);
      setActivePresetId(null);
    } finally {
      setLoadingPresets(false);
    }
  }

  async function loadFields(presetId: number | null) {
    if (!presetId) {
      setFields([]);
      return;
    }
    setLoadingFields(true);
    try {
      const json = await apiJson<{ data: OrderField[] }>(`/api/order-presets/presets/${presetId}/fields?includeInactive=1`, { cache: "no-store" });
      setFields(json.data || []);
    } catch (err: any) {
      toast({ title: "Error al cargar campos", description: err?.message || "No se pudo cargar", variant: "destructive" });
      setFields([]);
    } finally {
      setLoadingFields(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    void loadTypes();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !activeCode) return;
    void loadPresets(activeCode);
  }, [isAdmin, activeCode]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadFields(activePresetId);
  }, [isAdmin, activePresetId]);

  function toggleExt(list: string[], ext: string, checked: boolean) {
    if (checked) return Array.from(new Set([...list, ext]));
    return list.filter((x) => x !== ext);
  }

  // Preset CRUD
  async function createPreset() {
    if (!createPresetLabel.trim()) return;
    setSaving(true);
    try {
      await apiJson(`/api/order-presets/types/${encodeURIComponent(activeCode)}/presets`, {
        method: "POST",
        body: JSON.stringify({ label: createPresetLabel.trim() }),
      });
      setOpenCreatePreset(false);
      setCreatePresetLabel("");
      await loadPresets(activeCode);
      toast({ title: "Preset creado" });
    } catch (err: any) {
      toast({ title: "No se pudo crear el preset", description: err?.message || "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function updatePreset() {
    if (!editPresetTarget || !editPresetLabel.trim()) return;
    setSaving(true);
    try {
      await apiJson(`/api/order-presets/presets/${editPresetTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ label: editPresetLabel.trim(), isActive: editPresetTarget.isActive }),
      });
      setOpenEditPreset(false);
      await loadPresets(activeCode);
      toast({ title: "Preset actualizado" });
    } catch (err: any) {
      toast({ title: "No se pudo actualizar el preset", description: err?.message || "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function deletePreset(preset: OrderPreset) {
    setSaving(true);
    try {
      const json = await apiJson<{ data?: { fallbackPresetId?: number | null } }>(`/api/order-presets/presets/${preset.id}`, {
        method: "DELETE",
      });
      setPresets((prev) => prev.filter((current) => current.id !== preset.id));
      if (json?.data?.fallbackPresetId) {
        setActivePresetId(json.data.fallbackPresetId);
      } else if (activePresetId === preset.id) {
        setActivePresetId(null);
      }
      setDeletePresetTarget(null);
      setOpenEditPreset(false);
      await loadPresets(activeCode);
      toast({ title: "Preset eliminado", description: "Se ocultó del uso activo y el formulario hará fallback al preset disponible." });
    } catch (err: any) {
      toast({ title: "No se pudo eliminar el preset", description: err?.message || "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // Field CRUD
  async function createField() {
    if (!createForm.label.trim() || !activePresetId) return;
    setSaving(true);
    try {
      const payload: any = {
        label: createForm.label.trim(),
        fieldType: createForm.fieldType,
        required: createForm.required,
        visibleInTracking: createForm.visibleInTracking,
        useInAgenda: (createForm as any).useInAgenda,
        config: {
          placeholder: createForm.placeholder || undefined,
          defaultValue: createForm.defaultValue === "" ? undefined : (createForm.fieldType === "NUMBER" || createForm.fieldType === "MONEY" ? Number(createForm.defaultValue) : createForm.defaultValue),
          currencyCode: createForm.fieldType === "MONEY" ? createForm.currencyCode : undefined,
          sectionLabel: createForm.sectionLabel.trim() || undefined,
          sectionOrder: createForm.sectionOrder === "" ? undefined : Number(createForm.sectionOrder),
          visibleInForm: true,
        },
      };
      if (createForm.fieldType === "FILE") {
        payload.config = {
          ...payload.config,
          allowedExtensions: createForm.allowedExtensions,
          mediaMode: createForm.mediaMode,
          acceptMode: createForm.acceptMode,
          maxFiles: Number(createForm.maxFiles || 1),
          expectedFiles: createForm.expectedFiles === "" ? undefined : Number(createForm.expectedFiles),
          trackingRender: createForm.trackingRender,
        };
      }
      if (createForm.fieldType === "SELECT" || createForm.fieldType === "CHECKBOX") {
        payload.config = { ...payload.config, options: normalizeOptions((createForm as any).selectOptions || []) };
      }
      await apiJson(`/api/order-presets/presets/${activePresetId}/fields`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setOpenCreateField(false);
      setCreateForm(getEmptyOrderPresetFieldForm() as any);
      await loadFields(activePresetId);
      toast({ title: "Campo agregado" });
    } catch (err: any) {
      toast({ title: "No se pudo crear", description: err?.message || "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function patchField(id: number, patch: Record<string, unknown>, okMsg = "Campo actualizado") {
    try {
      await apiJson(`/api/order-presets/fields/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await loadFields(activePresetId);
      toast({ title: okMsg });
    } catch (err: any) {
      toast({ title: "No se pudo actualizar", description: err?.message || "Error", variant: "destructive" });
    }
  }

  async function setFieldActive(field: OrderField, nextActive: boolean) {
    try {
      await patchField(field.id, { isActive: nextActive }, nextActive ? "Campo activado" : "Campo desactivado");
    } catch {
      // toast already handled in patchField
    }
  }

  async function deleteField(field: OrderField) {
    try {
      await apiJson(`/api/order-presets/fields/${field.id}`, {
        method: "DELETE",
      });
      await loadFields(activePresetId);
      toast({ title: "Campo eliminado" });
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: err?.message || "Error", variant: "destructive" });
    }
  }

  async function moveField(id: number, dir: -1 | 1) {
    const idx = sortedFields.findIndex((f) => f.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sortedFields.length) return;
    const reordered = [...sortedFields];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(target, 0, item);
    try {
      await apiJson(`/api/order-presets/presets/${activePresetId}/fields/reorder`, {
        method: "POST",
        body: JSON.stringify({ orderedFieldIds: reordered.map((f) => f.id) }),
      });
      await loadFields(activePresetId);
    } catch (err: any) {
      toast({ title: "No se pudo reordenar", description: err?.message || "Error", variant: "destructive" });
    }
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Presets de pedidos</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Solo administradores pueden gestionar esta configuración.</p>
        </CardContent>
  
      <AlertDialog open={Boolean(criticalDeactivateTarget)} onOpenChange={(open: boolean) => { if (!open) setCriticalDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Advertencia de campo crítico</AlertDialogTitle>
            <AlertDialogDescription>{getCriticalWarning(criticalDeactivateTarget)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (!criticalDeactivateTarget) return; const target = criticalDeactivateTarget; setCriticalDeactivateTarget(null); await setFieldActive(target, false); }}>Continuar y desactivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Presets por tipo de pedido</h3>
          <p className="text-sm text-muted-foreground">Configurá campos custom distribuidos en hasta 5 presets por tipo de pedido.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadingTypes ? <p className="text-sm text-muted-foreground">Cargando tipos...</p> : null}

        <Tabs value={activeCode} onValueChange={setActiveCode}>
          <TabsList>
            {types.filter((t) => t.isActive).map((t) => (
              <TabsTrigger key={t.code} value={t.code}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loadingPresets ? <p className="text-sm text-muted-foreground">Cargando presets...</p> : null}

        {!loadingPresets && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {activePresets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay presets activos. Creá uno para configurar campos.</p>
                ) : (
                  activePresets.map((p) => (
                    <Button
                      key={p.id}
                      variant={activePresetId === p.id ? "default" : "outline"}
                      onClick={() => setActivePresetId(p.id)}
                      className="gap-2"
                    >
                      {p.label}
                      {isDefaultPreset(p) ? <Badge variant="secondary" className="ml-1">Base</Badge> : null}
                      <Pencil
                        className="w-3 h-3 ml-2 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditPresetTarget(p);
                          setEditPresetLabel(p.label);
                          setOpenEditPreset(true);
                        }}
                      />
                    </Button>
                  ))
                )}
              </div>
              <Button
                variant="secondary"
                onClick={() => setOpenCreatePreset(true)}
                disabled={!canCreateMoreOrderPresets(presets)}
              >
                <Plus className="w-4 h-4 mr-2" /> Nuevo Preset
              </Button>
            </div>

            {activePresetId ? (
              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Campos del Preset</h4>
                  <Button size="sm" onClick={() => setOpenCreateField(true)} data-testid="button-add-order-preset-field">
                    <Plus className="w-4 h-4 mr-2" /> Agregar campo
                  </Button>
                </div>

                {loadingFields ? <p className="text-sm text-muted-foreground">Cargando campos...</p> : null}

                <div className="space-y-2">
                  {sortedFields.map((f, idx) => (
                    <div key={f.id} className="border rounded-md p-3 flex flex-wrap items-center gap-4">
                      <div className="flex-1 min-w-[200px]">
                        <p className="font-medium truncate">{f.label}</p>
                        <p className="text-xs text-muted-foreground">key: {f.fieldKey}</p>
                      </div>

                      <div className="mr-auto flex items-center gap-2">
                        <Badge variant="secondary">{f.fieldType}</Badge>
                        <Badge variant={f.isSystemDefault ? "outline" : "default"}>{f.isSystemDefault ? "Default" : "Custom"}</Badge>
                        <Badge variant={f.isActive ? "default" : "secondary"}>{f.isActive ? "Activo" : "Inactivo"}</Badge>
                        {String((f.config as any)?.sectionLabel || "").trim() ? <Badge variant="outline">Sección: {String((f.config as any)?.sectionLabel)}</Badge> : null}
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <label className={`flex items-center gap-2 ${f.isActive ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}>
                          <Switch
                            checked={f.required}
                            disabled={!f.isActive}
                            onCheckedChange={(checked) => patchField(f.id, { required: checked })}
                          />
                          Requerido
                        </label>

                        <label className={`flex items-center gap-2 ${f.isActive ? "cursor-pointer text-muted-foreground hover:text-foreground" : "opacity-60 cursor-not-allowed text-muted-foreground"}`}>
                          {f.visibleInTracking ? <Eye className="w-4 h-4 text-blue-500" /> : <EyeOff className="w-4 h-4" />}
                          <Switch
                            checked={f.visibleInTracking}
                            disabled={!f.isActive}
                            onCheckedChange={(checked) => patchField(f.id, { visibleInTracking: checked })}
                          />
                          Tracking
                        </label>

                        {(f.fieldType === "DATE" || f.fieldType === "DATETIME") && (
                          <label className={`flex items-center gap-2 ${f.isActive ? "cursor-pointer text-muted-foreground hover:text-foreground" : "opacity-60 cursor-not-allowed text-muted-foreground"}`}>
                            <Switch
                              checked={Boolean(f.useInAgenda)}
                              disabled={!f.isActive}
                              onCheckedChange={(checked) => patchField(f.id, { useInAgenda: checked })}
                            />
                            Usar en Agenda
                          </label>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <label className="flex items-center gap-2 px-2 text-sm cursor-pointer">
                          <Switch
                            checked={f.isActive}
                            onCheckedChange={(checked) => {
                              if (!checked && isCriticalField(f)) {
                                setCriticalDeactivateTarget(f);
                                return;
                              }
                              void setFieldActive(f, checked);
                            }}
                          />
                          {f.isActive ? "Activo" : "Inactivo"}
                        </label>
                        <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => moveField(f.id, -1)}><ArrowUp className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" disabled={idx === sortedFields.length - 1} onClick={() => moveField(f.id, 1)}><ArrowDown className="w-4 h-4" /></Button>
                        <Button size="icon" variant="outline" onClick={() => {
                          setEditTarget(f);
                          setEditForm({
                            label: f.label,
                            required: f.required,
                            isActive: f.isActive,
                            visibleInTracking: pickVisibleTrackingDefault(f.visibleInTracking),
                            useInAgenda: Boolean((f as any).useInAgenda),
                            placeholder: String((f.config as any)?.placeholder || ""),
                            defaultValue: String((f.config as any)?.defaultValue ?? ""),
                            currencyCode: String((f.config as any)?.currencyCode || "ARS"),
                            allowedExtensions: f.fieldType === "FILE" ? (f.config?.allowedExtensions || ["pdf", "jpg", "png", "jpeg"]) : [],
                            mediaMode: resolveFileFieldBehavior(f.config).mediaMode,
                            acceptMode: resolveFileFieldBehavior(f.config).acceptMode,
                            maxFiles: String(resolveFileFieldBehavior(f.config).maxFiles),
                            expectedFiles: resolveFileFieldBehavior(f.config).expectedFiles == null ? "" : String(resolveFileFieldBehavior(f.config).expectedFiles),
                            trackingRender: resolveFileFieldBehavior(f.config).trackingRender,
                            selectOptions: normalizeOptions((f.config as any)?.options || [""]),
                            sectionLabel: String((f.config as any)?.sectionLabel || (f.config as any)?.sectionName || ""),
                            sectionOrder: String((f.config as any)?.sectionOrder ?? ""),
                          });
                          setOpenEditField(true);
                        }}><Pencil className="w-4 h-4" /></Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          onClick={() => {
                            if (window.confirm(`¿Eliminar definitivamente "${f.label}" del preset? Dejará de aparecer y no se validará más.`)) {
                              void deleteField(f);
                            }
                          }}
                          title="Eliminar campo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!loadingFields && sortedFields.length === 0 ? <p className="text-sm text-muted-foreground">No hay campos para este preset.</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>

      {/* CREATE PRESET DIALOG */}
      <Dialog open={openCreatePreset} onOpenChange={setOpenCreatePreset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Preset</DialogTitle>
            <DialogDescription>Crear un nuevo conjunto de campos para {activeCode}. (Máximo 5)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nombre del Preset</Label>
              <Input
                placeholder="Ej. Express, Garantía..."
                value={createPresetLabel}
                onChange={(e) => setCreatePresetLabel(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCreatePreset(false)}>Cancelar</Button>
            <Button disabled={saving || !createPresetLabel.trim()} onClick={createPreset}>{saving ? "Guardando..." : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT PRESET DIALOG */}
      <Dialog open={openEditPreset} onOpenChange={setOpenEditPreset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Preset</DialogTitle>
            <DialogDescription>Ajustá el nombre, archivá o eliminá este preset custom.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre del Preset</Label>
              <Input
                value={editPresetLabel}
                onChange={(e) => setEditPresetLabel(e.target.value)}
              />
            </div>
            {isDefaultPreset(editPresetTarget) ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                Este es el preset base del sistema. Se puede editar o archivar, pero no eliminar para preservar la lógica y el fallback seguro.
              </div>
            ) : (
              <div className="rounded-md border border-red-200 bg-red-50/60 p-3 text-sm">
                <p className="font-medium text-red-700">Eliminar preset custom</p>
                <p className="text-muted-foreground">
                  Se oculta totalmente del uso activo, deja de aparecer en el alta y el sistema hace fallback al preset válido disponible.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex items-center sm:justify-between w-full">
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!editPresetTarget) return;
                  setSaving(true);
                  try {
                    await apiJson(`/api/order-presets/presets/${editPresetTarget.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ isActive: false }),
                    });
                    setOpenEditPreset(false);
                    await loadPresets(activeCode);
                    toast({ title: "Preset archivado" });
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
              >
                Archivar Preset
              </Button>
              {!isDefaultPreset(editPresetTarget) ? (
                <Button variant="outline" onClick={() => editPresetTarget && setDeletePresetTarget(editPresetTarget)} disabled={saving}>
                  Eliminar Preset
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpenEditPreset(false)}>Cancelar</Button>
              <Button disabled={saving || !editPresetLabel.trim()} onClick={updatePreset}>{saving ? "Guardando..." : "Guardar"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE FIELD DIALOG */}
      <Dialog open={openCreateField} onOpenChange={setOpenCreateField}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar campo</DialogTitle>
            <DialogDescription>Nuevo campo para el preset seleccionado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={createForm.label} onChange={(e) => setCreateForm((s) => ({ ...s, label: e.target.value }))} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Sección</Label>
                <Input value={createForm.sectionLabel} onChange={(e) => setCreateForm((s) => ({ ...s, sectionLabel: e.target.value }))} placeholder="General, Equipo, Datos técnicos..." />
              </div>
              <div className="space-y-2">
                <Label>Orden de sección</Label>
                <Input type="number" min={0} value={createForm.sectionOrder} onChange={(e) => setCreateForm((s) => ({ ...s, sectionOrder: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={createForm.fieldType} onValueChange={(v) => setCreateForm((s) => normalizeCreateFormForFieldType(s, v as any))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">Texto Corto</SelectItem>
                  <SelectItem value="TEXT_LONG">Texto Largo</SelectItem>
                  <SelectItem value="NUMBER">Número</SelectItem>
                  <SelectItem value="MONEY">Dinero / Moneda</SelectItem>
                  <SelectItem value="FILE">Archivo Adjunto</SelectItem>
                  <SelectItem value="CHECKBOX">Casilla (Checkbox)</SelectItem>
                  <SelectItem value="SELECT">Desplegable (Select)</SelectItem>
                  <SelectItem value="DATE">Fecha</SelectItem>
                  <SelectItem value="TIME">Hora</SelectItem>
                  <SelectItem value="DATETIME">Fecha y Hora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-3 py-2 border rounded-md p-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Switch checked={createForm.required} onCheckedChange={(checked) => setCreateForm((s) => ({ ...s, required: checked }))} /> Requerido
              </label>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Switch checked={createForm.visibleInTracking} onCheckedChange={(checked) => setCreateForm((s) => ({ ...s, visibleInTracking: checked }))} />
                <span className="flex items-center gap-1">Visible en tracking público {createForm.visibleInTracking ? <Eye className="w-4 h-4 text-blue-500" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}</span>
              </label>

              {(createForm.fieldType === "DATE" || createForm.fieldType === "DATETIME") && (
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer border-t pt-3 mt-1">
                  <Switch checked={createForm.useInAgenda} onCheckedChange={(checked) => setCreateForm((s) => ({ ...s, useInAgenda: checked }))} />
                  <span className="flex items-center gap-1 text-primary">Mostrar automáticante en la Agenda</span>
                </label>
              )}
            </div>

            {createForm.fieldType === "FILE" ? (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Modo del bloque</Label>
                    <Select value={createForm.mediaMode} onValueChange={(value: "single" | "gallery" | "attachments") => setCreateForm((s) => {
                      const nextAcceptMode = value === "gallery" ? "images" : s.acceptMode;
                      const nextTrackingRender = value === "gallery"
                        ? (s.trackingRender === "list" ? "grid" : s.trackingRender)
                        : (s.trackingRender === "grid" || s.trackingRender === "carousel" ? s.trackingRender : "list");
                      return {
                        ...s,
                        mediaMode: value,
                        acceptMode: nextAcceptMode,
                        maxFiles: value === "single" ? "1" : (Number(s.maxFiles || 1) > 1 ? s.maxFiles : "6"),
                        trackingRender: nextTrackingRender,
                      };
                    })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Archivo único</SelectItem>
                        <SelectItem value="gallery">Galería de imágenes</SelectItem>
                        <SelectItem value="attachments">Múltiples adjuntos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Acepta</Label>
                    <Select value={createForm.acceptMode} onValueChange={(value: "images" | "mixed") => setCreateForm((s) => ({ ...s, acceptMode: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mixed">Archivos mixtos</SelectItem>
                        <SelectItem value="images">Solo imágenes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Máximo de archivos</Label>
                    <Input type="number" min={1} max={20} value={createForm.maxFiles} onChange={(e) => setCreateForm((s) => ({ ...s, maxFiles: e.target.value }))} disabled={createForm.mediaMode === "single"} />
                  </div>
                  <div className="space-y-2">
                    <Label>Esperado / sugerido</Label>
                    <Input type="number" min={1} max={20} value={createForm.expectedFiles} onChange={(e) => setCreateForm((s) => ({ ...s, expectedFiles: e.target.value }))} placeholder="Opcional" disabled={createForm.mediaMode === "single"} />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Render en tracking</Label>
                    <Select value={createForm.trackingRender} onValueChange={(value: "grid" | "carousel" | "list") => setCreateForm((s) => ({ ...s, trackingRender: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="list">Lista</SelectItem>
                        <SelectItem value="grid">Grilla</SelectItem>
                        <SelectItem value="carousel">Carrusel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Label>Extensiones permitidas</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FILE_EXTENSIONS.map((ext) => (
                    <label key={ext} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted p-1 rounded">
                      <Checkbox
                        checked={createForm.allowedExtensions.includes(ext)}
                        onCheckedChange={(checked) => setCreateForm((s) => ({ ...s, allowedExtensions: toggleExt(s.allowedExtensions, ext, Boolean(checked)) }))}
                      />
                      .{ext}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Usá “Galería” para fotos múltiples y “Múltiples adjuntos” para documentos o combinaciones de archivos.
                </p>
              </div>
            ) : null}

            {(createForm.fieldType === "TEXT" || createForm.fieldType === "TEXT_LONG" || createForm.fieldType === "NUMBER" || createForm.fieldType === "MONEY") ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Placeholder</Label>
                  <Input value={createForm.placeholder} onChange={(e) => setCreateForm((s) => ({ ...s, placeholder: e.target.value }))} placeholder="Opcional" />
                </div>
                <div className="space-y-2">
                  <Label>Valor por defecto</Label>
                  <Input type={createForm.fieldType === "NUMBER" || createForm.fieldType === "MONEY" ? "number" : "text"} value={createForm.defaultValue} onChange={(e) => setCreateForm((s) => ({ ...s, defaultValue: e.target.value }))} placeholder="Opcional" />
                </div>
                {createForm.fieldType === "MONEY" ? (
                  <div className="space-y-2 col-span-2">
                    <Label>Moneda</Label>
                    <Input value={createForm.currencyCode} maxLength={3} onChange={(e) => setCreateForm((s) => ({ ...s, currencyCode: e.target.value.toUpperCase() }))} placeholder="ARS" />
                  </div>
                ) : null}
              </div>
            ) : null}

            {createForm.fieldType === "SELECT" || createForm.fieldType === "CHECKBOX" ? (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md">
                <Label>Opciones</Label>
                <div className="space-y-2">
                  {createForm.selectOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => setCreateForm((prev) => {
                          const next = [...prev.selectOptions];
                          next[idx] = e.target.value;
                          if (idx === next.length - 1 && e.target.value.trim()) next.push("");
                          return { ...prev, selectOptions: next };
                        })}
                        placeholder={`Opción ${idx + 1}`}
                      />
                      <Button type="button" variant="outline" size="icon" disabled={createForm.selectOptions.length <= 1} onClick={() => setCreateForm((prev) => ({ ...prev, selectOptions: prev.selectOptions.filter((_, i) => i !== idx) || [""] }))}>×</Button>
                      <Button type="button" variant="ghost" size="icon" disabled={idx === 0} onClick={() => setCreateForm((prev) => { const next=[...prev.selectOptions]; [next[idx-1],next[idx]]=[next[idx],next[idx-1]]; return { ...prev, selectOptions: next }; })}><ArrowUp className="w-4 h-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" disabled={idx >= createForm.selectOptions.length - 1} onClick={() => setCreateForm((prev) => { const next=[...prev.selectOptions]; [next[idx+1],next[idx]]=[next[idx],next[idx+1]]; return { ...prev, selectOptions: next }; })}><ArrowDown className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Completá una opción y se agrega la siguiente automáticamente.</p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCreateField(false)}>Cancelar</Button>
            <Button disabled={saving || !createForm.label.trim()} onClick={createField}>{saving ? "Guardando..." : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT FIELD DIALOG */}
      <Dialog open={openEditField} onOpenChange={setOpenEditField}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar campo</DialogTitle>
            <DialogDescription>Ajustá los parámetros del campo seleccionado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={editForm.label} onChange={(e) => setEditForm((s) => ({ ...s, label: e.target.value }))} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Sección</Label>
                <Input value={editForm.sectionLabel} onChange={(e) => setEditForm((s) => ({ ...s, sectionLabel: e.target.value }))} placeholder="General, Equipo, Datos técnicos..." />
              </div>
              <div className="space-y-2">
                <Label>Orden de sección</Label>
                <Input type="number" min={0} value={editForm.sectionOrder} onChange={(e) => setEditForm((s) => ({ ...s, sectionOrder: e.target.value }))} placeholder="0" />
              </div>
            </div>

            <div className="flex flex-col gap-3 py-2 border rounded-md p-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Switch checked={editForm.required} onCheckedChange={(checked) => setEditForm((s) => ({ ...s, required: checked }))} /> Requerido
              </label>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Switch checked={editForm.visibleInTracking} onCheckedChange={(checked) => setEditForm((s) => ({ ...s, visibleInTracking: checked }))} />
                <span className="flex items-center gap-1">Visible en tracking público {editForm.visibleInTracking ? <Eye className="w-4 h-4 text-blue-500" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}</span>
              </label>

              {(editTarget?.fieldType === "DATE" || editTarget?.fieldType === "DATETIME") && (
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer border-t pt-3 mt-1">
                  <Switch checked={editForm.useInAgenda} onCheckedChange={(checked) => setEditForm((s) => ({ ...s, useInAgenda: checked }))} />
                  <span className="flex items-center gap-1 text-primary">Mostrar automáticante en la Agenda</span>
                </label>
              )}
            </div>

            {editTarget?.fieldType === "FILE" ? (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Modo del bloque</Label>
                    <Select value={editForm.mediaMode} onValueChange={(value: "single" | "gallery" | "attachments") => setEditForm((s) => {
                      const nextAcceptMode = value === "gallery" ? "images" : s.acceptMode;
                      const nextTrackingRender = value === "gallery"
                        ? (s.trackingRender === "list" ? "grid" : s.trackingRender)
                        : (s.trackingRender === "grid" || s.trackingRender === "carousel" ? s.trackingRender : "list");
                      return {
                        ...s,
                        mediaMode: value,
                        acceptMode: nextAcceptMode,
                        maxFiles: value === "single" ? "1" : (Number(s.maxFiles || 1) > 1 ? s.maxFiles : "6"),
                        trackingRender: nextTrackingRender,
                      };
                    })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Archivo único</SelectItem>
                        <SelectItem value="gallery">Galería de imágenes</SelectItem>
                        <SelectItem value="attachments">Múltiples adjuntos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Acepta</Label>
                    <Select value={editForm.acceptMode} onValueChange={(value: "images" | "mixed") => setEditForm((s) => ({ ...s, acceptMode: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mixed">Archivos mixtos</SelectItem>
                        <SelectItem value="images">Solo imágenes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Máximo de archivos</Label>
                    <Input type="number" min={1} max={20} value={editForm.maxFiles} onChange={(e) => setEditForm((s) => ({ ...s, maxFiles: e.target.value }))} disabled={editForm.mediaMode === "single"} />
                  </div>
                  <div className="space-y-2">
                    <Label>Esperado / sugerido</Label>
                    <Input type="number" min={1} max={20} value={editForm.expectedFiles} onChange={(e) => setEditForm((s) => ({ ...s, expectedFiles: e.target.value }))} placeholder="Opcional" disabled={editForm.mediaMode === "single"} />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Render en tracking</Label>
                    <Select value={editForm.trackingRender} onValueChange={(value: "grid" | "carousel" | "list") => setEditForm((s) => ({ ...s, trackingRender: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="list">Lista</SelectItem>
                        <SelectItem value="grid">Grilla</SelectItem>
                        <SelectItem value="carousel">Carrusel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Label>Extensiones permitidas</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FILE_EXTENSIONS.map((ext) => (
                    <label key={ext} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted p-1 rounded">
                      <Checkbox
                        checked={editForm.allowedExtensions.includes(ext)}
                        onCheckedChange={(checked) => setEditForm((s) => ({ ...s, allowedExtensions: toggleExt(s.allowedExtensions, ext, Boolean(checked)) }))}
                      />
                      .{ext}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  El tracking público usará esta preferencia para mostrar imágenes y adjuntos agrupados.
                </p>
              </div>
            ) : null}

            {(editTarget?.fieldType === "TEXT" || editTarget?.fieldType === "TEXT_LONG" || editTarget?.fieldType === "NUMBER" || editTarget?.fieldType === "MONEY") ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Placeholder</Label>
                  <Input value={editForm.placeholder} onChange={(e) => setEditForm((s) => ({ ...s, placeholder: e.target.value }))} placeholder="Opcional" />
                </div>
                <div className="space-y-2">
                  <Label>Valor por defecto</Label>
                  <Input type={editTarget?.fieldType === "NUMBER" || editTarget?.fieldType === "MONEY" ? "number" : "text"} value={editForm.defaultValue} onChange={(e) => setEditForm((s) => ({ ...s, defaultValue: e.target.value }))} placeholder="Opcional" />
                </div>
                {editTarget?.fieldType === "MONEY" ? (
                  <div className="space-y-2 col-span-2">
                    <Label>Moneda</Label>
                    <Input value={editForm.currencyCode} maxLength={3} onChange={(e) => setEditForm((s) => ({ ...s, currencyCode: e.target.value.toUpperCase() }))} placeholder="ARS" />
                  </div>
                ) : null}
              </div>
            ) : null}

            {editTarget?.fieldType === "SELECT" || editTarget?.fieldType === "CHECKBOX" ? (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md">
                <Label>Opciones</Label>
                <div className="space-y-2">
                  {editForm.selectOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input value={opt} onChange={(e) => setEditForm((prev) => { const next=[...prev.selectOptions]; next[idx]=e.target.value; if (idx===next.length-1 && e.target.value.trim()) next.push(""); return { ...prev, selectOptions: next }; })} placeholder={`Opción ${idx + 1}`} />
                      <Button type="button" variant="outline" size="icon" disabled={editForm.selectOptions.length <= 1} onClick={() => setEditForm((prev) => ({ ...prev, selectOptions: prev.selectOptions.filter((_, i) => i !== idx) || [""] }))}>×</Button>
                      <Button type="button" variant="ghost" size="icon" disabled={idx === 0} onClick={() => setEditForm((prev) => { const next=[...prev.selectOptions]; [next[idx-1],next[idx]]=[next[idx],next[idx-1]]; return { ...prev, selectOptions: next }; })}><ArrowUp className="w-4 h-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" disabled={idx >= editForm.selectOptions.length - 1} onClick={() => setEditForm((prev) => { const next=[...prev.selectOptions]; [next[idx+1],next[idx]]=[next[idx],next[idx+1]]; return { ...prev, selectOptions: next }; })}><ArrowDown className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEditField(false)}>Cancelar</Button>
            <Button
              disabled={saving || !editTarget || !editForm.label.trim()}
              onClick={async () => {
                if (!editTarget) return;
                setSaving(true);
                try {
                  const patch: any = {
                    label: editForm.label.trim(),
                    required: editForm.required,
                    isActive: editForm.isActive,
                    visibleInTracking: editForm.visibleInTracking,
                    config: {
                      ...(editTarget.config || {}),
                      placeholder: editForm.placeholder || undefined,
                      defaultValue: editForm.defaultValue === "" ? undefined : ((editTarget.fieldType === "NUMBER" || editTarget.fieldType === "MONEY") ? Number(editForm.defaultValue) : editForm.defaultValue),
                      currencyCode: editTarget.fieldType === "MONEY" ? editForm.currencyCode : undefined,
                      sectionLabel: editForm.sectionLabel.trim() || undefined,
                      sectionOrder: editForm.sectionOrder === "" ? undefined : Number(editForm.sectionOrder),
                      visibleInForm: true,
                    },
                  };
                  if (editTarget.fieldType === "DATE" || editTarget.fieldType === "DATETIME") {
                    patch.useInAgenda = editForm.useInAgenda;
                  }
                  if (editTarget.fieldType === "FILE") {
                    patch.config = {
                      ...patch.config,
                      allowedExtensions: editForm.allowedExtensions,
                      mediaMode: editForm.mediaMode,
                      acceptMode: editForm.acceptMode,
                      maxFiles: Number(editForm.maxFiles || 1),
                      expectedFiles: editForm.expectedFiles === "" ? undefined : Number(editForm.expectedFiles),
                      trackingRender: editForm.trackingRender,
                    };
                  }
                  if (editTarget.fieldType === "SELECT" || editTarget.fieldType === "CHECKBOX") {
                    patch.config = { ...patch.config, options: normalizeOptions(editForm.selectOptions || []) };
                  }
                  await patchField(editTarget.id, patch, "Campo actualizado");
                  setOpenEditField(false);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(criticalDeactivateTarget)} onOpenChange={(open: boolean) => { if (!open) setCriticalDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Advertencia de campo crítico</AlertDialogTitle>
            <AlertDialogDescription>{getCriticalWarning(criticalDeactivateTarget)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (!criticalDeactivateTarget) return; setCriticalDeactivateTarget(null); await setFieldActive(criticalDeactivateTarget, false); }}>Continuar y desactivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deletePresetTarget)} onOpenChange={(open: boolean) => { if (!open) setDeletePresetTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar preset</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePresetTarget
                ? `Se eliminará "${deletePresetTarget.label}" del uso activo. Los pedidos históricos se preservan y el sistema hará fallback al preset válido disponible.`
                : "Confirmá la eliminación del preset."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletePresetTarget && void deletePreset(deletePresetTarget)}>
              Sí, eliminar preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
