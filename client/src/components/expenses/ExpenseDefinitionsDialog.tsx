import { useEffect, useMemo, useState } from "react";
import {
  createExpenseDefinition,
  deleteExpenseDefinition,
  getExpenseDefinitions,
  updateExpenseDefinition,
  type ExpenseDefinitionType,
} from "@/lib/expenses";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { ExpenseDefinition } from "@shared/schema";

interface ExpenseDefinitionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const typeLabels: Record<ExpenseDefinitionType, string> = {
  FIXED: "Gastos fijos",
  VARIABLE: "Gastos variables",
};

const defaultForm = {
  name: "",
  description: "",
  category: "",
  defaultAmount: "",
  currency: "",
  isActive: true,
};

function formatDate(date?: string | Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ExpenseDefinitionsTab({
  type,
  items,
  onRefresh,
}: {
  type: ExpenseDefinitionType;
  items: ExpenseDefinition[];
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(defaultForm);
    setEditingId(null);
  }, [type]);

  const handleEdit = (item: ExpenseDefinition) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      description: item.description || "",
      category: item.category || "",
      defaultAmount: item.defaultAmount ? String(item.defaultAmount) : "",
      currency: item.currency || "",
      isActive: item.isActive ?? true,
    });
  };

  const handleCancel = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "FIXED" && (!form.defaultAmount || parseFloat(form.defaultAmount) <= 0)) {
      toast({ title: "Error", description: "Ingresá un monto mensual válido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateExpenseDefinition(editingId, {
          name: form.name,
          description: form.description || null,
          category: form.category || null,
          defaultAmount: form.defaultAmount ? parseFloat(form.defaultAmount) : null,
          currency: form.currency || null,
          isActive: form.isActive,
        });
        toast({ title: "Gasto actualizado" });
      } else {
        await createExpenseDefinition({
          type,
          name: form.name,
          description: form.description || null,
          category: form.category || null,
          defaultAmount: form.defaultAmount ? parseFloat(form.defaultAmount) : null,
          currency: form.currency || null,
          isActive: form.isActive,
        });
        toast({ title: "Gasto creado" });
      }
      handleCancel();
      await onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = window.confirm("¿Eliminar esta definición de gasto?");
    if (!confirmed) return;
    try {
      await deleteExpenseDefinition(id);
      toast({ title: "Gasto eliminado" });
      await onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {editingId ? "Editar gasto" : "Nuevo gasto"}
          </p>
          {editingId && (
            <Badge variant="secondary" className="text-xs">
              Editando
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre del gasto"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categoría (opcional)</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ej: Servicios"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Descripción (opcional)</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Detalle o nota"
            rows={2}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{type === "FIXED" ? "Monto mensual" : "Monto sugerido (opcional)"}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.defaultAmount}
              onChange={(e) => setForm({ ...form, defaultAmount: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Moneda (opcional)</Label>
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              placeholder="ARS"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={form.isActive}
            onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
          />
          <span className="text-sm text-muted-foreground">
            {form.isActive ? "Activo" : "Inactivo"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear"}
          </Button>
          {editingId && (
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No hay gastos definidos.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{item.name}</p>
                  <Badge variant={item.isActive ? "default" : "secondary"} className="text-xs">
                    {item.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                  {item.category && (
                    <Badge variant="outline" className="text-xs">
                      {item.category}
                    </Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                )}
                {item.defaultAmount && (
                  <p className="text-xs text-muted-foreground">
                    Monto mensual: {item.currency || "$"} {parseFloat(item.defaultAmount).toFixed(2)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Creado: {formatDate(item.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEdit(item)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ExpenseDefinitionsDialog({ open, onOpenChange }: ExpenseDefinitionsDialogProps) {
  const { toast } = useToast();
  const [definitions, setDefinitions] = useState<ExpenseDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ExpenseDefinitionType>("FIXED");

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getExpenseDefinitions();
      setDefinitions(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      refresh();
    }
  }, [open]);

  const definitionsByType = useMemo(
    () => ({
      FIXED: definitions.filter((item) => item.type === "FIXED"),
      VARIABLE: definitions.filter((item) => item.type === "VARIABLE"),
    }),
    [definitions]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configuración de gastos</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(value) => setTab(value as ExpenseDefinitionType)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="FIXED">{typeLabels.FIXED}</TabsTrigger>
            <TabsTrigger value="VARIABLE">{typeLabels.VARIABLE}</TabsTrigger>
          </TabsList>
          <TabsContent value="FIXED" className="pt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : (
              <ExpenseDefinitionsTab
                type="FIXED"
                items={definitionsByType.FIXED}
                onRefresh={refresh}
              />
            )}
          </TabsContent>
          <TabsContent value="VARIABLE" className="pt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : (
              <ExpenseDefinitionsTab
                type="VARIABLE"
                items={definitionsByType.VARIABLE}
                onRefresh={refresh}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
