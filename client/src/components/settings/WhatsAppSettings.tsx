import { useEffect, useMemo, useState } from "react";
import { apiRequest, getToken, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type EnvironmentMode = "sandbox" | "production";

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
  environmentMode: EnvironmentMode;
  sandboxRecipientPhone: string;
  connectedBusinessPhone: string;
  sandboxAllowedRecipients: string;
}

interface WhatsappAutomationConfigForm {
  enabled: boolean;
  webhookUrl: string;
  signingSecret: string;
  timeoutMs: number;
  retryEnabled: boolean;
  retryMaxAttempts: number;
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
  environmentMode: "production",
  sandboxRecipientPhone: "",
  connectedBusinessPhone: "",
  sandboxAllowedRecipients: "",
};

function normalizeRecipient(value: string) {
  return String(value || "").replace(/\+/g, "").replace(/[\s\-()]/g, "").replace(/\D/g, "").trim();
}

function parseAllowedRecipients(raw: string) {
  return Array.from(new Set(String(raw || "")
    .split(/[\n,;]+/g)
    .map((x) => normalizeRecipient(x))
    .filter(Boolean)));
}

function statusLabel(status?: string) {
  if (!status) return "No configurado";
  const map: Record<string, string> = {
    not_configured: "No configurado",
    incomplete: "Incompleto",
    sandbox_ready: "Sandbox listo",
    production_ready: "Producción lista",
    error: "Error",
  };
  return map[status] || status;
}

export function WhatsAppSettings() {
  const { toast } = useToast();
  const { user } = useAuth();

  const internalSandboxFlag = String(import.meta.env.VITE_WHATSAPP_INTERNAL_SANDBOX || "").toLowerCase() === "true";
  const canUseSandbox = Boolean(user?.isSuperAdmin || user?.role === "admin" || internalSandboxFlag);
  const canEditTechnicalConfig = Boolean(user?.role === "admin" || user?.isSuperAdmin);
  const canViewSensitiveFields = Boolean(user?.isSuperAdmin || internalSandboxFlag);

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
  const [automationConfig, setAutomationConfig] = useState<WhatsappAutomationConfigForm>({
    enabled: false,
    webhookUrl: "",
    signingSecret: "",
    timeoutMs: 8000,
    retryEnabled: true,
    retryMaxAttempts: 3,
  });
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [testingAutomation, setTestingAutomation] = useState(false);

  const normalizedRecipientPreview = useMemo(() => normalizeRecipient(testPhone), [testPhone]);

  async function loadOnboarding() {
    try {
      const res = await apiRequest("GET", "/api/whatsapp/onboarding");
      const data = await res.json();
      setOnboarding(data?.data || null);
      if (data?.data?.environmentMode) {
        setForm((prev) => ({
          ...prev,
          environmentMode: canUseSandbox ? data.data.environmentMode : "production",
          sandboxRecipientPhone: data.data.sandboxRecipientPhone || prev.sandboxRecipientPhone,
          connectedBusinessPhone: data.data.channelConnectedPhone || prev.connectedBusinessPhone,
          sandboxAllowedRecipients: Array.isArray(data.data.sandboxAllowedRecipients) ? data.data.sandboxAllowedRecipients.join("\n") : prev.sandboxAllowedRecipients,
        }));
      }
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
          connectedBusinessPhone: summary?.data?.connectedPhone || "",
          sandboxRecipientPhone: summary?.data?.sandboxRecipientPhone || "",
          environmentMode: canUseSandbox ? (summary?.data?.environmentMode || "production") : "production",
          sandboxAllowedRecipients: Array.isArray(summary?.data?.sandboxAllowedRecipients) ? summary.data.sandboxAllowedRecipients.join("\n") : "",
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
          environmentMode: canUseSandbox ? (data.data.environmentMode || "production") : "production",
          sandboxRecipientPhone: data.data.sandboxRecipientPhone || "",
          connectedBusinessPhone: data.data.connectedBusinessPhone || data.data.phoneNumber || "",
          sandboxAllowedRecipients: Array.isArray(data.data.sandboxAllowedRecipients) ? data.data.sandboxAllowedRecipients.join("\n") : "",
        }));
      }
    } catch (err: any) {
      toast({ title: "Error cargando canal", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function loadAutomationConfig() {
    try {
      const res = await apiRequest("GET", "/api/whatsapp/automation/config");
      const json = await res.json();
      const data = json?.data;
      if (!data) return;
      setAutomationConfig({
        enabled: Boolean(data.enabled),
        webhookUrl: data.webhookUrl || "",
        signingSecret: data.signingSecret || "",
        timeoutMs: Number(data.timeoutMs || 8000),
        retryEnabled: Boolean(data.retryEnabled),
        retryMaxAttempts: Number(data.retryMaxAttempts || 3),
      });
    } catch {
      // noop
    }
  }

  useEffect(() => {
    loadChannel();
    loadHealth();
    loadOnboarding();
    loadAutomationConfig();
  }, []);

  async function refreshState() {
    await Promise.all([loadChannel(), loadHealth(), loadOnboarding(), loadAutomationConfig()]);
  }

  async function saveAutomationConfig() {
    setSavingAutomation(true);
    try {
      await apiRequest("PUT", "/api/whatsapp/automation/config", automationConfig);
      toast({ title: "Automatización guardada" });
      await refreshState();
    } catch (err: any) {
      toast({ title: "Error guardando automatización", description: err?.message || "Error", variant: "destructive" });
    } finally {
      setSavingAutomation(false);
    }
  }

  async function testAutomationWebhook() {
    setTestingAutomation(true);
    try {
      const res = await apiRequest("POST", "/api/whatsapp/automation/config/test");
      const json = await res.json();
      toast({ title: json?.data?.ok ? "Webhook automation OK" : "Webhook automation con error", description: `status=${json?.data?.statusCode || "n/a"}` });
      await refreshState();
    } catch (err: any) {
      toast({ title: "Error probando webhook", description: err?.message || "Error", variant: "destructive" });
    } finally {
      setTestingAutomation(false);
    }
  }

  async function saveChannel() {
    if (!canEditTechnicalConfig) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        provider: form.provider,
        phoneNumber: form.phoneNumber,
        phoneNumberId: form.phoneNumberId,
        businessAccountId: form.businessAccountId,
        displayName: form.displayName,
        accessToken: form.accessToken,
        appSecret: form.appSecret,
        status: form.status,
        isActive: form.isActive,
        environmentMode: canUseSandbox ? form.environmentMode : "production",
        sandboxRecipientPhone: canUseSandbox && form.environmentMode === "sandbox" ? form.sandboxRecipientPhone : null,
        connectedBusinessPhone: form.environmentMode === "production" ? form.connectedBusinessPhone : form.phoneNumber,
        sandboxAllowedRecipients: canUseSandbox && form.environmentMode === "sandbox" ? parseAllowedRecipients(form.sandboxAllowedRecipients) : [],
      };

      if (canViewSensitiveFields && form.webhookVerifyToken.trim()) {
        payload.webhookVerifyToken = form.webhookVerifyToken;
      }

      await apiRequest("PUT", "/api/whatsapp/channels/current", payload);
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
      toast({ title: "Error validando conexión", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  async function sendTest() {
    setSending(true);
    setSendResult(null);
    try {
      const token = getToken();
      const res = await fetch("/api/whatsapp/messages/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ to: testPhone, text: testText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const semantic = data?.semanticCode || data?.code || "WHATSAPP_META_UNKNOWN_ERROR";
        const detail = data?.error || data?.metaDetails || data?.metaMessage || "Error no especificado";
        throw new Error(`${semantic}: ${detail}`);
      }
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

  const runtimeMode: EnvironmentMode = canUseSandbox
    ? (form.environmentMode || health?.environmentMode || "production")
    : "production";
  const displayStatus = statusLabel(health?.channelProductStatus || onboarding?.channelProductStatus);

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">WhatsApp del negocio</h3>
        <p className="text-sm text-muted-foreground">Conectá el número real de tu negocio para atender clientes desde el inbox.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p><strong>Estado:</strong> {displayStatus}</p>
            <Badge variant="secondary">{runtimeMode === "production" ? "Producción" : "Sandbox interno"}</Badge>
            <Badge variant={onboarding?.inboxEnabled ? "outline" : "secondary"}>Inbox {onboarding?.inboxEnabled ? "activo" : "inactivo"}</Badge>
          </div>
          <p><strong>Número conectado:</strong> {health?.connectedPhone || onboarding?.channelConnectedPhone || "-"}</p>
          <p><strong>Último test exitoso:</strong> {health?.lastTestAt ? new Date(health.lastTestAt).toLocaleString() : "Sin test"}</p>
          <p><strong>Última validación:</strong> {health?.lastConnectionValidatedAt ? new Date(health.lastConnectionValidatedAt).toLocaleString() : "Sin validación"}</p>
          <p><strong>Token presente:</strong> {health?.accessTokenPresent ? "Sí" : "No"} · <strong>Recipients sandbox:</strong> {health?.sandboxRecipientsConfiguredCount ?? 0}</p>
          <p><strong>Test template disponible:</strong> {health?.canSendTestTemplate ? "Sí" : "No"}</p>
          <p><strong>Quién puede editar:</strong> owner/admin autorizado o superadmin.</p>
        </div>

        <div className="rounded-md border p-3 text-sm space-y-2">
          <p className="font-medium">Checklist de onboarding</p>
          {(onboarding?.steps || []).map((step: any) => (
            <p key={step.key} className="text-xs">{step.completed ? "✅" : "⬜"} {step.title}</p>
          ))}
        </div>

        {canUseSandbox ? (
          <div className="rounded-md border p-3 space-y-3">
            <p className="font-medium">Elegí modo de conexión</p>
            <div className="flex gap-2">
              <Button variant={runtimeMode === "production" ? "default" : "outline"} onClick={() => setForm((p) => ({ ...p, environmentMode: "production" }))} disabled={!canEditTechnicalConfig}>Conectar número real</Button>
              <Button variant={runtimeMode === "sandbox" ? "default" : "outline"} onClick={() => setForm((p) => ({ ...p, environmentMode: "sandbox" }))} disabled={!canEditTechnicalConfig}>Sandbox (solo pruebas internas)</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {runtimeMode === "sandbox"
                ? "Pruebas internas: usa número de prueba de Meta y destinatario autorizado."
                : "Producción: este canal atiende clientes reales desde el inbox."}
            </p>
          </div>
        ) : (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">Modo producción (cliente real)</p>
            <p className="text-xs text-muted-foreground">El modo sandbox está reservado para superadmin/testing interno y no forma parte del onboarding del cliente.</p>
          </div>
        )}

        {runtimeMode === "sandbox" ? (
          <div className="rounded-md border p-3 space-y-2">
            <p className="font-medium">Pruebas internas (sandbox)</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Destinatario sandbox autorizado</Label>
                <Input value={form.sandboxRecipientPhone} onChange={(e) => setForm((p) => ({ ...p, sandboxRecipientPhone: e.target.value }))} placeholder="Ej: 542236979026" disabled={!canEditTechnicalConfig} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Números permitidos (sandbox)</Label>
                <Textarea
                  value={form.sandboxAllowedRecipients}
                  onChange={(e) => setForm((p) => ({ ...p, sandboxAllowedRecipients: e.target.value }))}
                  placeholder={`Un número por línea o separados por coma
542236979026
5491122334455`}
                  rows={4}
                  disabled={!canEditTechnicalConfig}
                />
                <p className="text-[11px] text-muted-foreground">Estos son números permitidos en Orbia (validación interna).</p>
                <p className="text-[11px] text-muted-foreground">Agregar un número acá NO lo autoriza automáticamente en Meta sandbox. También debés agregarlo en Meta &gt; número de prueba &gt; destinatarios autorizados.</p>
              </div>
              <div className="space-y-1">
                <Label>Access token (sandbox)</Label>
                <Input value={form.accessToken || ""} onChange={(e) => setForm((p) => ({ ...p, accessToken: e.target.value }))} placeholder="Token de prueba Meta" disabled={!canEditTechnicalConfig} />
              </div>
              <div className="space-y-1">
                <Label>Phone number ID (sandbox)</Label>
                <Input value={form.phoneNumberId} onChange={(e) => setForm((p) => ({ ...p, phoneNumberId: e.target.value }))} placeholder="ID número prueba" disabled={!canEditTechnicalConfig} />
              </div>
              <div className="space-y-1">
                <Label>Business account ID (sandbox)</Label>
                <Input value={form.businessAccountId || ""} onChange={(e) => setForm((p) => ({ ...p, businessAccountId: e.target.value }))} placeholder="ID cuenta de prueba" disabled={!canEditTechnicalConfig} />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border p-3 space-y-2">
            <p className="font-medium">Conectar número real del negocio</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Número conectado</Label>
                <Input value={form.connectedBusinessPhone} onChange={(e) => setForm((p) => ({ ...p, connectedBusinessPhone: e.target.value, phoneNumber: e.target.value }))} placeholder="Ej: +54911..." disabled={!canEditTechnicalConfig} />
              </div>
              <div className="space-y-1">
                <Label>ID del número</Label>
                <Input value={form.phoneNumberId} onChange={(e) => setForm((p) => ({ ...p, phoneNumberId: e.target.value }))} placeholder="ID del número en Meta" disabled={!canEditTechnicalConfig} />
              </div>
              <div className="space-y-1">
                <Label>ID de cuenta empresarial</Label>
                <Input value={form.businessAccountId || ""} onChange={(e) => setForm((p) => ({ ...p, businessAccountId: e.target.value }))} placeholder="Business Account ID" disabled={!canEditTechnicalConfig} />
              </div>
              <div className="space-y-1">
                <Label>Token de acceso</Label>
                <Input value={form.accessToken || ""} onChange={(e) => setForm((p) => ({ ...p, accessToken: e.target.value }))} placeholder="Token de WhatsApp Cloud API" disabled={!canEditTechnicalConfig} />
              </div>
            </div>
          </div>
        )}

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
            <div className="space-y-1"><Label>Phone number base</Label><Input value={form.phoneNumber} onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Display name</Label><Input value={form.displayName || ""} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} /></div>
            <div className="space-y-1"><Label>App secret</Label><Input value={form.appSecret || ""} onChange={(e) => setForm((p) => ({ ...p, appSecret: e.target.value }))} placeholder="Masked tras guardar" /></div>
            {canViewSensitiveFields ? (
              <div className="space-y-1"><Label>Webhook verify token (interno)</Label><Input value={form.webhookVerifyToken || ""} onChange={(e) => setForm((p) => ({ ...p, webhookVerifyToken: e.target.value }))} placeholder="Solo uso técnico/interno" /></div>
            ) : null}
          </div>
        ) : null}

        <div className="border rounded-md p-3 space-y-3">
          <p className="text-sm font-medium">Automatización / n8n</p>
          <p className="text-xs text-muted-foreground">La automatización solo actuará en conversaciones configuradas en modo automatizado.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2"><Switch checked={automationConfig.enabled} onCheckedChange={(checked) => setAutomationConfig((p) => ({ ...p, enabled: checked }))} /><Label>Integración habilitada</Label></div>
            <div className="space-y-1"><Label>Webhook URL</Label><Input value={automationConfig.webhookUrl} onChange={(e) => setAutomationConfig((p) => ({ ...p, webhookUrl: e.target.value }))} placeholder="https://n8n..." /></div>
            <div className="space-y-1"><Label>Signing secret</Label><Input value={automationConfig.signingSecret} onChange={(e) => setAutomationConfig((p) => ({ ...p, signingSecret: e.target.value }))} placeholder="clave compartida" /></div>
            <div className="space-y-1"><Label>Timeout (ms)</Label><Input type="number" value={automationConfig.timeoutMs} onChange={(e) => setAutomationConfig((p) => ({ ...p, timeoutMs: Number(e.target.value) || 8000 }))} /></div>
            <div className="flex items-center gap-2"><Switch checked={automationConfig.retryEnabled} onCheckedChange={(checked) => setAutomationConfig((p) => ({ ...p, retryEnabled: checked }))} /><Label>Retry habilitado</Label></div>
            <div className="space-y-1"><Label>Reintentos máximos</Label><Input type="number" value={automationConfig.retryMaxAttempts} onChange={(e) => setAutomationConfig((p) => ({ ...p, retryMaxAttempts: Number(e.target.value) || 1 }))} /></div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={saveAutomationConfig} disabled={savingAutomation || !canEditTechnicalConfig}>{savingAutomation ? "Guardando..." : "Guardar automatización"}</Button>
            <Button variant="outline" onClick={testAutomationWebhook} disabled={testingAutomation || !canEditTechnicalConfig}>{testingAutomation ? "Probando..." : "Probar webhook"}</Button>
          </div>
        </div>

        <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(checked) => setForm((p) => ({ ...p, isActive: checked }))} /><Label>Canal activo</Label></div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={saveChannel} disabled={saving || !canEditTechnicalConfig}>{saving ? "Guardando..." : "Guardar y continuar"}</Button>
          <Button variant="outline" onClick={testConnection} disabled={testing || !canEditTechnicalConfig}>{testing ? "Validando..." : "Validar canal"}</Button>
        </div>

        <div className="border rounded-md p-3 space-y-2">
          <p className="text-sm font-medium">Enviar mensaje de prueba</p>
          <p className="text-xs text-muted-foreground">Sandbox usa <code>hello_world</code>. Producción valida el envío del canal real.</p>
          <div className="grid md:grid-cols-2 gap-2">
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder={runtimeMode === "sandbox" ? "Destinatario sandbox" : "Cliente real"} />
            <Input value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="Texto para modo libre" />
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
