import { useEffect, useMemo, useState } from "react";
import { authFetch, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Pencil, Plus, Eye, EyeOff } from "lucide-react";

type OrderType = { id: number; code: string; label: string; isActive: boolean };
type OrderPreset = { id: number; orderTypeId: number; code: string; label: string; isActive: boolean; sortOrder: number };
type OrderField = {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: "TEXT" | "NUMBER" | "FILE";
  required: boolean;
  visibleInTracking: boolean;
  sortOrder: number;
  config?: { allowedExtensions?: string[] };
  isActive: boolean;
};

type ApiErr = { message: string; code?: string };

const FILE_EXTENSIONS = ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"] as const;

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

  // Preset Create/Edit Modals
  const [openCreatePreset, setOpenCreatePreset] = useState(false);
  const [createPresetLabel, setCreatePresetLabel] = useState("");
  const [openEditPreset, setOpenEditPreset] = useState(false);
  const [editPresetTarget, setEditPresetTarget] = useState<OrderPreset | null>(null);
  const [editPresetLabel, setEditPresetLabel] = useState("");

  // Field Create/Edit Modals
  const [openCreateField, setOpenCreateField] = useState(false);
  const [openEditField, setOpenEditField] = useState(false);
  const [createForm, setCreateForm] = useState({
    label: "",
    fieldType: "TEXT" as "TEXT" | "NUMBER" | "FILE",
    required: false,
    visibleInTracking: false,
    allowedExtensions: ["pdf", "jpg", "png", "jpeg"] as string[],
  });
  const [editTarget, setEditTarget] = useState<OrderField | null>(null);
  const [editForm, setEditForm] = useState({
    label: "",
    required: false,
    isActive: true,
    visibleInTracking: false,
    allowedExtensions: [] as string[],
  });

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [fields]
  );

  const activePresets = useMemo(() => presets.filter(p => p.isActive), [presets]);

  async function loadTypes() {
    setLoadingTypes(true);
    try {
      const json = await apiJson<{ data: OrderType[] }>("/api/order-presets/types");
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
      const json = await apiJson<{ data: OrderPreset[] }>(`/api/order-presets/types/${encodeURIComponent(code)}/presets`);
      const nextPresets = json.data || [];
      setPresets(nextPresets);
      if (nextPresets.length > 0) {
        // select first active or first
        const toSelect = nextPresets.find(p => p.isActive) || nextPresets[0];
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
      const json = await apiJson<{ data: OrderField[] }>(`/api/order-presets/presets/${presetId}/fields`);
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
      };
      if (createForm.fieldType === "FILE") {
        payload.config = { allowedExtensions: createForm.allowedExtensions };
      }
      await apiJson(`/api/order-presets/presets/${activePresetId}/fields`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setOpenCreateField(false);
      setCreateForm({ label: "", fieldType: "TEXT", required: false, visibleInTracking: false, allowedExtensions: ["pdf", "jpg", "png", "jpeg"] });
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

  async function deactivateField(id: number) {
    try {
      await apiJson(`/api/order-presets/fields/${id}/deactivate`, { method: "POST" });
      await loadFields(activePresetId);
      toast({ title: "Campo desactivado" });
    } catch (err: any) {
      toast({ title: "No se pudo desactivar", description: err?.message || "Error", variant: "destructive" });
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
      await apiJson(`/api/order-presets/types/${encodeURIComponent(activeCode)}/fields/reorder`, {
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
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Presets por tipo de pedido</h3>
          <p className="text-sm text-muted-foreground">Configurá campos custom distribuidos en hasta 3 presets por tipo de pedido.</p>
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
                disabled={activePresets.length >= 3}
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

                      <Badge variant="secondary" className="mr-auto">{f.fieldType}</Badge>

                      <div className="flex items-center gap-6 text-sm">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Switch
                            checked={f.required}
                            onCheckedChange={(checked) => patchField(f.id, { required: checked })}
                          />
                          Requerido
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                          {f.visibleInTracking ? <Eye className="w-4 h-4 text-blue-500" /> : <EyeOff className="w-4 h-4" />}
                          <Switch
                            checked={f.visibleInTracking}
                            onCheckedChange={(checked) => patchField(f.id, { visibleInTracking: checked })}
                          />
                          Tracking
                        </label>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => moveField(f.id, -1)}><ArrowUp className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" disabled={idx === sortedFields.length - 1} onClick={() => moveField(f.id, 1)}><ArrowDown className="w-4 h-4" /></Button>
                        <Button size="icon" variant="outline" onClick={() => {
                          setEditTarget(f);
                          setEditForm({
                            label: f.label,
                            required: f.required,
                            isActive: f.isActive,
                            visibleInTracking: f.visibleInTracking,
                            allowedExtensions: f.fieldType === "FILE" ? (f.config?.allowedExtensions || ["pdf", "jpg", "png", "jpeg"]) : [],
                          });
                          setOpenEditField(true);
                        }}><Pencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => deactivateField(f.id)}>Desactivar</Button>
                      </div>
                    </div>
                  ))}
                  {!loadingFields && sortedFields.length === 0 ? <p className="text-sm text-muted-foreground">No hay campos activos para este preset.</p> : null}
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
            <DialogDescription>Crear un nuevo conjunto de campos para {activeCode}. (Máximo 3)</DialogDescription>
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
            <DialogDescription>Ajustá el nombre o desactivá este preset.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre del Preset</Label>
              <Input
                value={editPresetLabel}
                onChange={(e) => setEditPresetLabel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex items-center sm:justify-between w-full">
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
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={createForm.fieldType} onValueChange={(v) => setCreateForm((s) => ({ ...s, fieldType: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">TEXT</SelectItem>
                  <SelectItem value="NUMBER">NUMBER</SelectItem>
                  <SelectItem value="FILE">FILE</SelectItem>
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
            </div>

            {createForm.fieldType === "FILE" ? (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md">
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

            <div className="flex flex-col gap-3 py-2 border rounded-md p-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Switch checked={editForm.required} onCheckedChange={(checked) => setEditForm((s) => ({ ...s, required: checked }))} /> Requerido
              </label>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Switch checked={editForm.visibleInTracking} onCheckedChange={(checked) => setEditForm((s) => ({ ...s, visibleInTracking: checked }))} />
                <span className="flex items-center gap-1">Visible en tracking público {editForm.visibleInTracking ? <Eye className="w-4 h-4 text-blue-500" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}</span>
              </label>
            </div>

            {editTarget?.fieldType === "FILE" ? (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md">
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
                    visibleInTracking: editForm.visibleInTracking
                  };
                  if (editTarget.fieldType === "FILE") patch.config = { allowedExtensions: editForm.allowedExtensions };
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
    </Card>
  );
}
