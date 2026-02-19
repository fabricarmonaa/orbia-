import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { WhatsAppMessagePreview } from "@/components/messaging/WhatsAppMessagePreview";

interface TemplateItem {
  id: number;
  name: string;
  body: string;
  isActive: boolean;
}

const variableChips = [
  "cliente_nombre",
  "cliente_telefono",
  "pedido_numero",
  "pedido_estado",
  "pedido_total",
  "pedido_fecha",
  "direccion_entrega",
  "negocio_nombre",
];

const sampleContext: Record<string, string> = {
  cliente_nombre: "Juan Pérez",
  cliente_telefono: "+5491122334455",
  pedido_numero: "1024",
  pedido_estado: "Pendiente",
  pedido_total: "$ 12.500",
  pedido_fecha: new Date().toLocaleString("es-AR"),
  direccion_entrega: "Av. Siempre Viva 742",
  negocio_nombre: "Orbia Demo",
};

function renderPreview(body: string) {
  return (body || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => sampleContext[key] || "—");
}

export default function MessagingSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [defaultCountry, setDefaultCountry] = useState("AR");
  const [savingCountry, setSavingCountry] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchTemplates() {
    try {
      const res = await apiRequest("GET", "/api/message-templates?includeInactive=1");
      const data = await res.json();
      setTemplates(data.data || []);
      setDefaultCountry(data.defaultCountry || "AR");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  const livePreview = useMemo(() => renderPreview(body), [body]);

  function insertVariable(variable: string) {
    const token = `{{${variable}}}`;
    setBody((prev) => (prev ? `${prev} ${token}` : token));
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setBody("");
    setIsActive(true);
  }

  async function saveTemplate() {
    if (!name.trim() || !body.trim()) {
      toast({ title: "Nombre y cuerpo son requeridos", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), body: body.trim(), isActive };
      if (editingId) {
        await apiRequest("PUT", `/api/message-templates/${editingId}`, payload);
      } else {
        await apiRequest("POST", "/api/message-templates", payload);
      }
      toast({ title: editingId ? "Plantilla actualizada" : "Plantilla creada" });
      resetForm();
      fetchTemplates();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(id: number) {
    try {
      await apiRequest("DELETE", `/api/message-templates/${id}`);
      toast({ title: "Plantilla eliminada" });
      fetchTemplates();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function saveCountry() {
    setSavingCountry(true);
    try {
      await apiRequest("PUT", "/api/message-templates/default-country", { defaultCountry });
      toast({ title: "País por defecto actualizado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingCountry(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mensajería (WhatsApp)</h1>
        <p className="text-muted-foreground">Mensajes predefinidos para abrir WhatsApp con texto prellenado.</p>
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-semibold">Configuración</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Este addon permite abrir WhatsApp con mensajes predefinidos (no automático).
          </p>
          <div className="flex items-end gap-2 max-w-sm">
            <div className="flex-1 space-y-1">
              <Label>País por defecto</Label>
              <Input value={defaultCountry} onChange={(e) => setDefaultCountry(e.target.value.toUpperCase())} maxLength={4} />
            </div>
            <Button onClick={saveCountry} disabled={savingCountry}>{savingCountry ? "Guardando..." : "Guardar"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold">Editor de plantilla</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Pedido pendiente" />
          </div>
          <div className="space-y-1">
            <Label>Mensaje</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Hola {{cliente_nombre}}, tu pedido #{{pedido_numero}}..." />
          </div>
          <div className="flex flex-wrap gap-2">
            {variableChips.map((v) => (
              <Button key={v} variant="outline" size="sm" type="button" onClick={() => insertVariable(v)}>
                {`{{${v}}}`}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>Activa</Label>
          </div>
          <WhatsAppMessagePreview text={livePreview} />
          <div className="flex gap-2">
            <Button onClick={saveTemplate} disabled={saving}>{saving ? "Guardando..." : editingId ? "Actualizar" : "Crear plantilla"}</Button>
            <Button variant="outline" onClick={resetForm}>Limpiar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold">Plantillas ({templates.length}/20)</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay plantillas todavía.</p>
          ) : (
            templates.map((tpl) => (
              <div key={tpl.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{tpl.name}</p>
                    <Badge variant={tpl.isActive ? "outline" : "secondary"}>{tpl.isActive ? "Activa" : "Inactiva"}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditingId(tpl.id); setName(tpl.name); setBody(tpl.body); setIsActive(tpl.isActive); }}>Editar</Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setName(`${tpl.name} (copia)`); setBody(tpl.body); setIsActive(tpl.isActive); }}>Duplicar</Button>
                    <Button size="sm" variant="destructive" onClick={() => removeTemplate(tpl.id)}>Eliminar</Button>
                  </div>
                </div>
                <WhatsAppMessagePreview text={renderPreview(tpl.body)} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
