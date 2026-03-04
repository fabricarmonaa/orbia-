import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/auth";
import { normalizeOptionListKey } from "@shared/validators/fields";
import { useOptionLists } from "@/hooks/use-option-lists";

export function OptionListsManager() {
  const { data, loading, error, reload } = useOptionLists();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [itemLabel, setItemLabel] = useState("");
  const [itemValue, setItemValue] = useState("");

  const selected = useMemo(() => data.find((d) => d.key === selectedKey) || null, [data, selectedKey]);

  async function createList() {
    try {
      await apiRequest("POST", "/api/option-lists", { key: normalizeOptionListKey(key || name), name });
      toast({ title: "Lista creada" });
      setName("");
      setKey("");
      await reload();
    } catch (err: any) {
      toast({ title: "No se pudo crear la lista", description: err?.message, variant: "destructive" });
    }
  }

  async function updateListName(listId: number, nextName: string) {
    try {
      await apiRequest("PATCH", `/api/option-lists/${listId}`, { name: nextName });
      toast({ title: "Lista actualizada" });
      await reload();
    } catch (err: any) {
      toast({ title: "No se pudo actualizar", description: err?.message, variant: "destructive" });
    }
  }

  async function deleteList(listId: number) {
    try {
      await apiRequest("DELETE", `/api/option-lists/${listId}`);
      toast({ title: "Lista eliminada" });
      if (selected?.id === listId) setSelectedKey("");
      await reload();
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: err?.message, variant: "destructive" });
    }
  }

  async function addItem() {
    if (!selected) return;
    try {
      await apiRequest("POST", `/api/option-lists/${selected.key}/items`, { value: itemValue || itemLabel, label: itemLabel });
      toast({ title: "Ítem agregado" });
      setItemLabel("");
      setItemValue("");
      await reload();
    } catch (err: any) {
      toast({ title: "No se pudo agregar el ítem", description: err?.message, variant: "destructive" });
    }
  }

  async function updateItem(itemId: number, patch: Record<string, unknown>) {
    if (!selected) return;
    try {
      await apiRequest("PATCH", `/api/option-lists/${selected.key}/items/${itemId}`, patch);
      await reload();
    } catch (err: any) {
      toast({ title: "No se pudo actualizar ítem", description: err?.message, variant: "destructive" });
    }
  }

  async function deleteItem(itemId: number) {
    if (!selected) return;
    try {
      await apiRequest("DELETE", `/api/option-lists/${selected.key}/items/${itemId}`);
      toast({ title: "Ítem eliminado" });
      await reload();
    } catch (err: any) {
      toast({ title: "No se pudo eliminar ítem", description: err?.message, variant: "destructive" });
    }
  }

  async function moveItem(itemId: number, direction: -1 | 1) {
    if (!selected?.items) return;
    const index = selected.items.findIndex((x) => x.id === itemId);
    const target = selected.items[index + direction];
    if (!target) return;
    try {
      await updateItem(selected.items[index].id, { sortOrder: target.sortOrder });
      await updateItem(target.id, { sortOrder: selected.items[index].sortOrder });
    } catch {}
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando listas desplegables…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listas desplegables reutilizables</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Input placeholder="Nombre de la lista" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Clave (slug)" value={key} onChange={(e) => setKey(normalizeOptionListKey(e.target.value))} />
          <Button onClick={createList} disabled={!name.trim()}>Crear lista</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Listas</p>
            {data.map((list) => (
              <div key={list.id} className={`w-full text-left rounded border p-2 ${selectedKey === list.key ? "border-primary" : ""}`}>
                <button type="button" onClick={() => setSelectedKey(list.key)} className="w-full text-left">
                  <div className="font-medium">{list.name}</div>
                  <div className="text-xs text-muted-foreground">{list.key} · {list.items?.length || 0} ítems</div>
                </button>
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => {
                    const next = prompt("Nuevo nombre de la lista", list.name);
                    if (next && next.trim()) void updateListName(list.id, next.trim());
                  }}>Editar</Button>
                  <Button size="sm" variant="outline" onClick={() => void deleteList(list.id)}>Eliminar</Button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Ítems</p>
            {selected ? (
              <>
                <div className="flex gap-2">
                  <Input placeholder="Label" value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} />
                  <Input placeholder="Value" value={itemValue} onChange={(e) => setItemValue(e.target.value)} />
                  <Button onClick={addItem}>Agregar</Button>
                </div>
                <div className="space-y-1">
                  {(selected.items || []).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded border p-2">
                      <div>
                        <div className="text-sm">{item.label}</div>
                        <div className="text-xs text-muted-foreground">{item.value} · {item.isActive ? "Activo" : "Inactivo"}</div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => moveItem(item.id, -1)}>↑</Button>
                        <Button size="sm" variant="outline" onClick={() => moveItem(item.id, 1)}>↓</Button>
                        <Button size="sm" variant="outline" onClick={() => void updateItem(item.id, { isActive: !item.isActive })}>{item.isActive ? "Desactivar" : "Activar"}</Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          const nextLabel = prompt("Editar label", item.label);
                          if (nextLabel && nextLabel.trim()) void updateItem(item.id, { label: nextLabel.trim() });
                        }}>Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => void deleteItem(item.id)}>Borrar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Seleccioná una lista para administrar sus ítems.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
