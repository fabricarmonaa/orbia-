import { useState, useEffect, useRef } from "react";
import { apiRequest, useAuth, getToken } from "@/lib/auth";
import { parseApiError } from "@/lib/api-errors";
import { usePlan } from "@/lib/plan";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlignVerticalJustifyStart,
  LayoutGrid,
  ListOrdered,
  Minus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBranding, defaultTenantBranding } from "@/context/BrandingContext";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { BillingSettings } from "@/components/settings/BillingSettings";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { OperationsSettings } from "@/components/settings/OperationsSettings";
import { AdvancedSettings } from "@/components/settings/AdvancedSettings";

import { OrderPresetsSettings } from "@/components/settings/OrderPresetsSettings";
import { PriceListPdfSettings } from "@/components/pdfs/PriceListPdfSettings";

interface Config {
  businessName: string;
  businessType: string;
  businessDescription: string;
  logoUrl: string;
  currency: string;
  trackingExpirationHours: number;
  language: string;
  trackingLayout: string;
  trackingPrimaryColor: string;
  trackingAccentColor: string;
  trackingBgColor: string;
  trackingTosText: string;
}

const layoutPresets = [
  {
    value: "classic",
    label: "Clásico",
    description: "Timeline vertical",
    Icon: AlignVerticalJustifyStart,
  },
  {
    value: "cards",
    label: "Tarjetas",
    description: "Cards lado a lado",
    Icon: LayoutGrid,
  },
  {
    value: "stepper",
    label: "Stepper",
    description: "Stepper horizontal",
    Icon: ListOrdered,
  },
  {
    value: "minimal",
    label: "Minimal",
    description: "Compacto y limpio",
    Icon: Minus,
  },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { tenantBranding, refreshBranding } = useBranding();
  const { plan, loading: planLoading, getLimit } = usePlan();
  const [config, setConfig] = useState<Config>({
    businessName: "",
    businessType: "",
    businessDescription: "",
    logoUrl: "",
    currency: "ARS",
    trackingExpirationHours: 24,
    language: "es",
    trackingLayout: "classic",
    trackingPrimaryColor: "#6366f1",
    trackingAccentColor: "#8b5cf6",
    trackingBgColor: "#ffffff",
    trackingTosText: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [brandingForm, setBrandingForm] = useState(defaultTenantBranding);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingUploading, setBrandingUploading] = useState(false);
  const tenantLogoInputRef = useRef<HTMLInputElement>(null);
  const [tenantSlug, setTenantSlug] = useState("");
  const [tosContent, setTosContent] = useState("");
  const [tosUpdatedAt, setTosUpdatedAt] = useState<string | null>(null);
  const [tosSaving, setTosSaving] = useState(false);
  const [slugSaving, setSlugSaving] = useState(false);

  const minTrackingHours = getLimit("tracking_retention_min_hours") || 1;
  const maxTrackingHours = getLimit("tracking_retention_max_hours") || 24;
  const previewOrder = {
    orderNumber: 123,
    type: "Pedido",
    status: "En Proceso",
    statusColor: brandingForm.colors.trackingBadge,
    customerName: "Cliente Ejemplo",
    createdAt: new Date().toISOString(),
    scheduledAt: null,
    closedAt: null,
    history: [
      { status: "Recibido", color: brandingForm.colors.primary, date: new Date().toISOString(), note: null },
      { status: "En Proceso", color: brandingForm.colors.secondary, date: new Date().toISOString(), note: null },
      { status: "Listo", color: "#e5e7eb", date: "", note: null },
    ],
    publicComments: [],
    trackingLayout: config.trackingLayout || "classic",
    trackingTosText: brandingForm.texts.trackingFooter,
  };

  useEffect(() => {
    if (user?.role === "admin") {
      fetchConfig();
      fetchTosConfig();
    } else {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    if (tenantBranding) {
      setBrandingForm({
        ...defaultTenantBranding,
        ...tenantBranding,
        colors: { ...defaultTenantBranding.colors, ...tenantBranding.colors },
        texts: { ...defaultTenantBranding.texts, ...tenantBranding.texts },
        links: { ...defaultTenantBranding.links, ...tenantBranding.links },
        pdfConfig: { ...defaultTenantBranding.pdfConfig, ...tenantBranding.pdfConfig },
      });
    }
  }, [tenantBranding]);

  async function fetchConfig() {
    try {
      const configRes = await apiRequest("GET", "/api/config");
      const configData = await configRes.json();
      if (configData.data) {
        setConfig({
          businessName: configData.data.businessName || "",
          businessType: configData.data.businessType || "",
          businessDescription: configData.data.businessDescription || "",
          logoUrl: configData.data.logoUrl || "",
          currency: configData.data.currency || "ARS",
          trackingExpirationHours: configData.data.trackingExpirationHours || 24,
          language: configData.data.language || "es",
          trackingLayout: configData.data.trackingLayout || "classic",
          trackingPrimaryColor: configData.data.trackingPrimaryColor || "#6366f1",
          trackingAccentColor: configData.data.trackingAccentColor || "#8b5cf6",
          trackingBgColor: configData.data.trackingBgColor || "#ffffff",
          trackingTosText: configData.data.trackingTosText || "",
        });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/config", config);
      toast({ title: "Configuración guardada" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTenantLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBrandingUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const token = getToken();
      const res = await fetch("/api/uploads/tenant-logo", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const info = await parseApiError(res, { maxUploadBytes: 1000000 });
        throw new Error(info.message);
      }
      const data = await res.json();
      if (data.url) {
        setBrandingForm((prev) => ({ ...prev, logoUrl: data.url }));
      }
      await refreshBranding();
      toast({ title: "Logo actualizado" });
    } catch (err: any) {
      toast({ title: "Error al subir logo", description: err.message, variant: "destructive" });
    } finally {
      setBrandingUploading(false);
      if (tenantLogoInputRef.current) tenantLogoInputRef.current.value = "";
    }
  }

  async function saveBranding(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setBrandingSaving(true);
    try {
      await apiRequest("PUT", "/api/branding/tenant", {
        logoUrl: brandingForm.logoUrl,
        displayName: brandingForm.displayName,
        colors: brandingForm.colors,
        texts: brandingForm.texts,
        links: brandingForm.links,
        pdfConfig: brandingForm.pdfConfig,
      });
      toast({ title: "Personalización guardada" });
      await refreshBranding();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBrandingSaving(false);
    }
  }

  async function resetBranding() {
    const reset = defaultTenantBranding;
    setBrandingForm(reset);
    setBrandingSaving(true);
    try {
      await apiRequest("PUT", "/api/branding/tenant", {
        logoUrl: reset.logoUrl,
        displayName: reset.displayName,
        colors: reset.colors,
        texts: reset.texts,
        links: reset.links,
        pdfConfig: reset.pdfConfig,
      });
      toast({ title: "Valores restaurados" });
      await refreshBranding();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBrandingSaving(false);
    }
  }


  async function fetchTosConfig() {
    try {
      const res = await apiRequest("GET", "/api/branding/tos");
      const data = await res.json();
      if (data?.data) {
        setTenantSlug(data.data.slug || "");
        setTosContent(data.data.tosContent || "");
        setTosUpdatedAt(data.data.tosUpdatedAt || null);
      }
    } catch {
      // noop
    }
  }

  async function saveTenantSlug() {
    setSlugSaving(true);
    try {
      const slug = tenantSlug
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
      await apiRequest("PATCH", "/api/branding/slug", { slug });
      setTenantSlug(slug);
      toast({ title: "Slug actualizado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSlugSaving(false);
    }
  }

  async function saveTosContent() {
    setTosSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/branding/tos", { tosContent });
      const data = await res.json();
      setTosContent(data?.data?.tosContent || tosContent);
      setTosUpdatedAt(data?.data?.tosUpdatedAt || new Date().toISOString());
      toast({ title: "Términos actualizados" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTosSaving(false);
    }
  }

  const slugPreview = `${window.location.origin}/t/${tenantSlug || "mi-negocio"}/tos`;
  const slugValid = /^[a-z0-9-]{1,120}$/.test(tenantSlug || "");

  if (loading || planLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const planCode = (plan?.planCode || "").toUpperCase();
  const isEconomic = planCode === "ECONOMICO";
  const isEscala = planCode === "ESCALA";
  const sections = [
    {
      id: "account",
      label: "Cuenta",
      content: <AccountSettings user={user || null} />,
    },
    ...(isAdmin
      ? [
        {
          id: "billing",
          label: "Plan y Suscripción",
          content: <BillingSettings plan={plan} />,
        },
        {
          id: "branding",
          label: "Personalización",
          content: (
            <BrandingSettings
              config={config}
              setConfig={setConfig}
              saveConfig={saveConfig}
              savingConfig={saving}
              minTrackingHours={minTrackingHours}
              maxTrackingHours={maxTrackingHours}
              brandingForm={brandingForm}
              setBrandingForm={setBrandingForm}
              brandingSaving={brandingSaving}
              brandingUploading={brandingUploading}
              tenantLogoInputRef={tenantLogoInputRef}
              handleTenantLogoUpload={handleTenantLogoUpload}
              saveBranding={saveBranding}
              resetBranding={resetBranding}
              previewOrder={previewOrder}
              layoutPresets={layoutPresets}
              planCode={planCode}
            />
          ),
        },
        {
          id: "tos",
          label: "Términos Públicos",
          content: (
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Términos y Condiciones</h3>
                <p className="text-sm text-muted-foreground">Configura el enlace público de términos por tenant.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Slug público</Label>
                  <div className="flex gap-2">
                    <Input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} placeholder="mi-negocio" />
                    <Button onClick={saveTenantSlug} disabled={slugSaving || !slugValid}>{slugSaving ? "Guardando..." : "Guardar slug"}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{slugPreview}</p>
                  {!slugValid ? <p className="text-xs text-red-600">Solo letras minúsculas, números y guiones (máx 120).</p> : null}
                </div>
                <div className="space-y-2">
                  <Label>Contenido de términos</Label>
                  <Textarea value={tosContent} onChange={(e) => setTosContent(e.target.value)} rows={12} />
                  <div className="flex items-center gap-2">
                    <Button onClick={saveTosContent} disabled={tosSaving}>{tosSaving ? "Guardando..." : "Guardar términos"}</Button>
                    <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(slugPreview)}>Copiar enlace</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Última actualización: {tosUpdatedAt ? new Date(tosUpdatedAt).toLocaleString() : "Sin actualizar"}</p>
                </div>
              </CardContent>
            </Card>
          ),
        },

        {
          id: "order-presets",
          label: "Pedidos (campos)",
          content: <OrderPresetsSettings />,
        },
        {
          id: "pdfs",
          label: "PDFs",
          content: <PriceListPdfSettings />,
        },
      ]
      : []),
    {
      id: "operations",
      label: "Operativo",
      content: <OperationsSettings />,
    },
    ...(isAdmin
      ? [
        {
          id: "advanced",
          label: "Avanzado",
          content: <AdvancedSettings />,
        },
      ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">Ajustes del negocio y preferencias</p>
      </div>

      <SettingsLayout sections={sections} />
    </div>
  );
}
