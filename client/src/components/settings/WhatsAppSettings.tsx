import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface WhatsappChannelForm {
  provider: string;
  phoneNumber: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayName: string;
  accessToken: string;
  appSecret: string;
  webhookVerifyToken: string;
  status: "DRAFT" | "ACTIVE" | "DISABLED" | "ERROR";
  isActive: boolean;
}

const emptyForm: WhatsappChannelForm = {
  provider: "meta",
  phoneNumber: "",
  phoneNumberId: "",
  businessAccountId: "",
  displayName: "",
  accessToken: "",
  appSecret: "",
  webhookVerifyToken: "",
  status: "DRAFT",
  isActive: false,
};

export function WhatsAppSettings() {
  const { toast } = useToast();
  const [form, setForm] = useState<WhatsappChannelForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testText, setTestText] = useState("Mensaje de prueba Orbia WhatsApp");
  const [webhookStatus, setWebhookStatus] = useState<string>("Sin verificar");

  async function loadChannel() {
    try {
      const res = await apiRequest("GET", "/api/whatsapp/channels/current");
      const data = await res.json();
      if (data?.data) {
        setForm((prev) => ({ ...prev, ...data.data }));
      }
    } catch (err: any) {
      toast({ title: "Error cargando canal", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChannel();
  }, []);

  async function saveChannel() {
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/whatsapp/channels/current", form);
      toast({ title: "Canal guardado" });
      await loadChannel();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const res = await apiRequest("POST", "/api/whatsapp/channels/test-connection");
      const data = await res.json();
      setWebhookStatus(data.ok ? "Canal listo" : "Canal incompleto");
      toast({ title: data.ok ? "Conexión OK" : "Conexión incompleta" });
    } catch (err: any) {
      toast({ title: "Error probando conexión", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  async function sendTest() {
    setSending(true);
    try {
      await apiRequest("POST", "/api/whatsapp/messages/send-test", { to: testPhone, text: testText });
      toast({ title: "Mensaje de prueba enviado" });
    } catch (err: any) {
      toast({ title: "Error enviando", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Cargando canal...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">WhatsApp Cloud API</h3>
        <p className="text-sm text-muted-foreground">Configuración base multi-tenant del canal oficial de WhatsApp.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1"><Label>Provider</Label><Input value={form.provider} onChange={(e) => setForm((p) => ({ ...p, provider: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Estado del canal</Label><Input value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))} /></div>
          <div className="space-y-1"><Label>Phone number</Label><Input value={form.phoneNumber} onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Phone number ID</Label><Input value={form.phoneNumberId} onChange={(e) => setForm((p) => ({ ...p, phoneNumberId: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Business account ID</Label><Input value={form.businessAccountId || ""} onChange={(e) => setForm((p) => ({ ...p, businessAccountId: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Display name</Label><Input value={form.displayName || ""} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Access token</Label><Input value={form.accessToken || ""} onChange={(e) => setForm((p) => ({ ...p, accessToken: e.target.value }))} placeholder="Se mostrará masked al volver a cargar" /></div>
          <div className="space-y-1"><Label>App secret</Label><Input value={form.appSecret || ""} onChange={(e) => setForm((p) => ({ ...p, appSecret: e.target.value }))} placeholder="Se mostrará masked al volver a cargar" /></div>
          <div className="space-y-1 md:col-span-2"><Label>Webhook verify token</Label><Input value={form.webhookVerifyToken || ""} onChange={(e) => setForm((p) => ({ ...p, webhookVerifyToken: e.target.value }))} placeholder="Se mostrará masked al volver a cargar" /></div>
        </div>

        <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(checked) => setForm((p) => ({ ...p, isActive: checked }))} /><Label>Canal activo</Label></div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveChannel} disabled={saving}>{saving ? "Guardando..." : "Guardar configuración"}</Button>
          <Button variant="outline" onClick={testConnection} disabled={testing}>{testing ? "Probando..." : "Probar conexión"}</Button>
        </div>

        <div className="border rounded-md p-3 space-y-2">
          <p className="text-sm font-medium">Enviar mensaje de prueba</p>
          <div className="grid md:grid-cols-2 gap-2">
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+549..." />
            <Input value={testText} onChange={(e) => setTestText(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={sendTest} disabled={sending || !testPhone.trim()}>{sending ? "Enviando..." : "Enviar test"}</Button>
          <p className="text-xs text-muted-foreground">Estado webhook: {webhookStatus}</p>
        </div>
      </CardContent>
    </Card>
  );
}
