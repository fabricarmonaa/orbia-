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
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";

type OrderType = { id: number; code: string; label: string; isActive: boolean };
type OrderField = {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: "TEXT" | "NUMBER" | "FILE";
  required: boolean;
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

  const [loadingFields, setLoadingFields] = useState(false);
  const [fields, setFields] = useState<OrderField[]>([]);

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const [createForm, setCreateForm] = useState({
    label: "",
    fieldType: "TEXT" as "TEXT" | "NUMBER" | "FILE",
    required: false,
    allowedExtensions: ["pdf", "jpg", "png", "jpeg"] as string[],
  });

  const [editTarget, setEditTarget] = useState<OrderField | null>(null);
  const [editForm, setEditForm] = useState({
    label: "",
    required: false,
    isActive: true,
    allowedExtensions: [] as string[],
  });

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [fields]
  );

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

  async function loadFields(code: string) {
    if (!code) return;
    setLoadingFields(true);
    try {
      const json = await apiJson<{ data: OrderField[] }>(`/api/order-presets/types/${encodeURIComponent(code)}/fields`);
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
    if (!isAdmin) return;
    void loadFields(activeCode);
  }, [isAdmin, activeCode]);

  function toggleExt(list: string[], ext: string, checked: boolean) {
    if (checked) return Array.from(new Set([...list, ext]));
    return list.filter((x) => x !== ext);
  }

  async function createField() {
    if (!createForm.label.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        label: createForm.label.trim(),
        fieldType: createForm.fieldType,
        required: createForm.required,
      };
      if (createForm.fieldType === "FILE") {
        payload.config = { allowedExtensions: createForm.allowedExtensions };
      }
      await apiJson(`/api/order-presets/types/${encodeURIComponent(activeCode)}/fields`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setOpenCreate(false);
      setCreateForm({ label: "", fieldType: "TEXT", required: false, allowedExtensions: ["pdf", "jpg", "png", "jpeg"] });
      await loadFields(activeCode);
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
      await loadFields(activeCode);
      toast({ title: okMsg });
    } catch (err: any) {
      toast({ title: "No se pudo actualizar", description: err?.message || "Error", variant: "destructive" });
    }
  }

  async function deactivateField(id: number) {
    try {
      await apiJson(`/api/order-presets/fields/${id}/deactivate`, { method: "POST" });
      await loadFields(activeCode);
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
      await loadFields(activeCode);
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
          <p className="text-sm text-muted-foreground">Configurá campos custom para PEDIDO, ENCARGO, SERVICIO y TURNO.</p>
        </div>
        <Button onClick={() => setOpenCreate(true)} data-testid="button-add-order-preset-field">
          <Plus className="w-4 h-4 mr-2" /> Agregar campo
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingTypes ? <p className="text-sm text-muted-foreground">Cargando tipos...</p> : null}

        <Tabs value={activeCode} onValueChange={setActiveCode}>
          <TabsList>
            {types.filter((t) => t.isActive).map((t) => (
              <TabsTrigger key={t.code} value={t.code}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loadingFields ? <p className="text-sm text-muted-foreground">Cargando campos...</p> : null}

        <div className="space-y-2">
          {sortedFields.map((f, idx) => (
            <div key={f.id} className="border rounded-md p-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{f.label}</p>
                <p className="text-xs text-muted-foreground">key: {f.fieldKey}</p>
              </div>
              <Badge variant="secondary">{f.fieldType}</Badge>
              <div className="text-xs flex items-center gap-2">Requerido
                <Switch checked={f.required} onCheckedChange={(checked) => patchField(f.id, { required: checked })} />
              </div>
              <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => moveField(f.id, -1)}><ArrowUp className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" disabled={idx === sortedFields.length - 1} onClick={() => moveField(f.id, 1)}><ArrowDown className="w-4 h-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => {
                setEditTarget(f);
                setEditForm({
                  label: f.label,
                  required: f.required,
                  isActive: f.isActive,
                  allowedExtensions: f.fieldType === "FILE" ? (f.config?.allowedExtensions || ["pdf", "jpg", "png", "jpeg"]) : [],
                });
                setOpenEdit(true);
              }}><Pencil className="w-4 h-4" /></Button>
              <Button size="sm" variant="destructive" onClick={() => deactivateField(f.id)}>Desactivar</Button>
            </div>
          ))}
          {!loadingFields && sortedFields.length === 0 ? <p className="text-sm text-muted-foreground">No hay campos activos para este tipo.</p> : null}
        </div>
      </CardContent>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar campo</DialogTitle>
            <DialogDescription>Nuevo campo para {activeCode}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Label</Label>
              <Input value={createForm.label} onChange={(e) => setCreateForm((s) => ({ ...s, label: e.target.value }))} />
            </div>
            <div className="space-y-1">
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
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={createForm.required} onCheckedChange={(checked) => setCreateForm((s) => ({ ...s, required: checked }))} /> Requerido
            </label>
            {createForm.fieldType === "FILE" ? (
              <div className="space-y-2">
                <Label>Extensiones permitidas</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FILE_EXTENSIONS.map((ext) => (
                    <label key={ext} className="flex items-center gap-2 text-sm">
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
            <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button>
            <Button disabled={saving || !createForm.label.trim()} onClick={createField}>{saving ? "Guardando..." : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar campo</DialogTitle>
            <DialogDescription>Ajustá los parámetros del campo seleccionado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Label</Label>
              <Input value={editForm.label} onChange={(e) => setEditForm((s) => ({ ...s, label: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={editForm.required} onCheckedChange={(checked) => setEditForm((s) => ({ ...s, required: checked }))} /> Requerido
            </label>
            {editTarget?.fieldType === "FILE" ? (
              <div className="space-y-2">
                <Label>Extensiones permitidas</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FILE_EXTENSIONS.map((ext) => (
                    <label key={ext} className="flex items-center gap-2 text-sm">
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
            <Button variant="outline" onClick={() => setOpenEdit(false)}>Cancelar</Button>
            <Button
              disabled={saving || !editTarget || !editForm.label.trim()}
              onClick={async () => {
                if (!editTarget) return;
                setSaving(true);
                try {
                  const patch: any = { label: editForm.label.trim(), required: editForm.required, isActive: editForm.isActive };
                  if (editTarget.fieldType === "FILE") patch.config = { allowedExtensions: editForm.allowedExtensions };
                  await patchField(editTarget.id, patch, "Campo actualizado");
                  setOpenEdit(false);
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
