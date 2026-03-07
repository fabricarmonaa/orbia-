import { useEffect, useMemo, useState } from "react";
import { apiRequest, useAuth } from "@/lib/auth";
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

function normalizeRecipient(value: string) {
  return String(value || "").replace(/\+/g, "").replace(/[\s\-()]/g, "").replace(/\D/g, "").trim();
}

export function WhatsAppSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canEditTechnicalConfig = user?.role === "admin";

  const [form, setForm] = useState<WhatsappChannelForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testText, setTestText] = useState("Mensaje de prueba Orbia WhatsApp");
  const [webhookStatus, setWebhookStatus] = useState<string>("Sin verificar");
  const [health, setHealth] = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sendResult, setSendResult] = useState<{ messageId?: string | null; modeUsed?: string; normalizedTo?: string } | null>(null);

  const normalizedRecipientPreview = useMemo(() => normalizeRecipient(testPhone), [testPhone]);

  async function loadOnboarding() {
    try {
      const res = await apiRequest("GET", "/api/whatsapp/onboarding");
      const data = await res.json();
      setOnboarding(data?.data || null);
    } catch {
      setOnboarding(null);
    }
  }

  async function loadHealth() {
    try {
      const res = await apiRequest("GET", "/api/whatsapp/health");
      const data = await res.json();
      setHealth(data || null);
    } catch {
      setHealth(null);
    }
  }

  async function loadChannel() {
    try {
      if (!canEditTechnicalConfig) {
        const summaryRes = await apiRequest("GET", "/api/whatsapp/channels/summary");
        const summary = await summaryRes.json();
        setForm((prev) => ({
          ...prev,
          status: summary?.data?.status || "DRAFT",
          phoneNumber: summary?.data?.connectedPhone || "",
          isActive: Boolean(summary?.data?.isActive),
        }));
        return;
      }

      const res = await apiRequest("GET", "/api/whatsapp/channels/current");
      const data = await res.json();
      if (data?.data) {
        setForm((prev) => ({
          ...prev,
          provider: data.data.provider || "meta",
          phoneNumber: data.data.phoneNumber || "",
          phoneNumberId: data.data.phoneNumberId || "",
          businessAccountId: data.data.businessAccountId || "",
          displayName: data.data.displayName || "",
          accessToken: data.data.accessToken || "",
          appSecret: data.data.appSecret || "",
          webhookVerifyToken: data.data.webhookVerifyToken || "",
          status: data.data.status || "DRAFT",
          isActive: Boolean(data.data.isActive),
        }));
      }
    } catch (err: any) {
      toast({ title: "Error cargando canal", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChannel();
    loadHealth();
    loadOnboarding();
  }, []);

  async function refreshState() {
    await Promise.all([loadChannel(), loadHealth(), loadOnboarding()]);
  }

  async function saveChannel() {
    if (!canEditTechnicalConfig) return;
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/whatsapp/channels/current", {
        provider: form.provider,
        phoneNumber: form.phoneNumber,
        phoneNumberId: form.phoneNumberId,
        businessAccountId: form.businessAccountId,
        displayName: form.displayName,
        accessToken: form.accessToken,
        appSecret: form.appSecret,
        webhookVerifyToken: form.webhookVerifyToken,
        status: form.status,
        isActive: form.isActive,
      });
      toast({ title: "Canal guardado" });
      await refreshState();
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
      await refreshState();
    } catch (err: any) {
      toast({ title: "Error probando conexión", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  async function sendTest() {
    setSending(true);
    setSendResult(null);
    try {
      const res = await apiRequest("POST", "/api/whatsapp/messages/send-test", { to: testPhone, text: testText }, { skipAuthHandling: true });
      const data = await res.json();
      const payload = data?.data || {};
      setSendResult({
        messageId: payload?.messageId || payload?.result?.providerMessageId || null,
        modeUsed: payload?.modeUsed || null,
        normalizedTo: payload?.normalizedTo || normalizedRecipientPreview,
      });
      toast({
        title: "Mensaje de prueba enviado",
        description: `mode=${payload?.modeUsed || "template_hello_world_test"} · to=${payload?.normalizedTo || normalizedRecipientPreview}`,
      });
      await refreshState();
    } catch (err: any) {
      toast({ title: "Error enviando test", description: err.message || "Error no especificado", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Cargando canal...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">WhatsApp Cloud API</h3>
        <p className="text-sm text-muted-foreground">Onboarding simple para conectar tu canal y operar el inbox premium.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
          <p><strong>Estado del canal:</strong> {health?.channelProductStatus || "incomplete"}</p>
          <p><strong>Modo actual:</strong> {health?.environmentMode === "production" ? "Producción" : "Sandbox / Test"}</p>
          <p><strong>Número conectado:</strong> {health?.connectedPhone || "-"}</p>
          <p><strong>Último test:</strong> {health?.lastTestAt ? new Date(health.lastTestAt).toLocaleString() : "Sin test exitoso"}</p>
          <p><strong>Inbox habilitado:</strong> {onboarding?.inboxEnabled ? "Sí" : "No"}</p>
          <p><strong>Quién puede editar configuración técnica:</strong> admins del tenant / superadmin.</p>
        </div>

        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium mb-2">Pasos de onboarding</p>
          <div className="space-y-1">
            {(onboarding?.steps || []).map((step: any) => (
              <p key={step.key} className="text-xs">{step.completed ? "✅" : "⬜"} {step.title}</p>
            ))}
          </div>
        </div>

        {!canEditTechnicalConfig ? (
          <p className="text-xs text-muted-foreground">Vista operativa: la configuración técnica avanzada está restringida para tu rol.</p>
        ) : (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "Ocultar configuración avanzada" : "Mostrar configuración avanzada"}
            </Button>
          </div>
        )}

        {canEditTechnicalConfig && showAdvanced ? (
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
        ) : null}

        <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(checked) => setForm((p) => ({ ...p, isActive: checked }))} /><Label>Canal activo</Label></div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveChannel} disabled={saving || !canEditTechnicalConfig}>{saving ? "Guardando..." : "Guardar configuración"}</Button>
          <Button variant="outline" onClick={testConnection} disabled={testing || !canEditTechnicalConfig}>{testing ? "Probando..." : "Validar conexión"}</Button>
        </div>

        <div className="border rounded-md p-3 space-y-2">
          <p className="text-sm font-medium">Modo prueba / sandbox</p>
          <p className="text-xs text-muted-foreground">Usa template <code>hello_world</code> para validar conexión. Esto no reemplaza templates de producción.</p>
          <div className="grid md:grid-cols-2 gap-2">
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+549..." />
            <Input value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="Solo se usa en modo text_freeform" />
          </div>
          <p className="text-xs text-muted-foreground">Número normalizado para Meta: <strong>{normalizedRecipientPreview || "-"}</strong></p>
          <Button variant="secondary" onClick={sendTest} disabled={sending || !testPhone.trim()}>{sending ? "Enviando..." : "Enviar test"}</Button>
          {sendResult ? (
            <div className="text-xs rounded border p-2 bg-muted/30">
              <p><strong>mode_used:</strong> {sendResult.modeUsed || "-"}</p>
              <p><strong>normalized_to:</strong> {sendResult.normalizedTo || "-"}</p>
              <p><strong>message_id:</strong> {sendResult.messageId || "-"}</p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">Estado webhook: {webhookStatus}</p>
        </div>
      </CardContent>
    </Card>
  );
}
