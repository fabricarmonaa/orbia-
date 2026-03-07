import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Palette, Save, Upload, Settings, Eye, ExternalLink, RotateCcw } from "lucide-react";
import type { TenantBranding } from "@/context/BrandingContext";
import { TrackingView } from "@/components/tracking/TrackingView";

interface ConfigForm {
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

interface LayoutPreset {
  value: string;
  label: string;
  description: string;
  Icon: any;
}

interface BrandingSettingsProps {
  planCode?: string;
  config: ConfigForm;
  setConfig: (value: ConfigForm) => void;
  saveConfig: (e: React.FormEvent) => void;
  savingConfig: boolean;
  minTrackingHours: number;
  maxTrackingHours: number;
  brandingForm: TenantBranding;
  setBrandingForm: (value: TenantBranding | ((prev: TenantBranding) => TenantBranding)) => void;
  brandingSaving: boolean;
  brandingUploading: boolean;
  tenantLogoInputRef: React.RefObject<HTMLInputElement>;
  handleTenantLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  saveBranding: (e?: React.FormEvent) => void;
  resetBranding: () => void;
  previewOrder: any;
  layoutPresets: LayoutPreset[];
}

export function BrandingSettings({
  config,
  setConfig,
  saveConfig,
  savingConfig,
  minTrackingHours,
  maxTrackingHours,
  brandingForm,
  setBrandingForm,
  brandingSaving,
  brandingUploading,
  tenantLogoInputRef,
  handleTenantLogoUpload,
  saveBranding,
  resetBranding,
  previewOrder,
  layoutPresets,
  planCode,
}: BrandingSettingsProps) {
  const [trackingHoursError, setTrackingHoursError] = useState<string>("");
  const minHours = minTrackingHours > 0 ? minTrackingHours : 1;
  const maxHours = maxTrackingHours > 0 ? maxTrackingHours : 24;
  const trackingPlanText = useMemo(() => `Tu plan permite entre ${minHours} y ${maxHours} horas.`, [minHours, maxHours]);
  const isEconomic = (planCode || "").toUpperCase() === "ECONOMICO";
  const trackingFieldToggles = [
    { key: "showLogo", label: "Mostrar logo" },
    { key: "showBusinessName", label: "Mostrar nombre del negocio" },
    { key: "showOrderNumber", label: "Mostrar número de pedido" },
    { key: "showOrderType", label: "Mostrar tipo" },
    { key: "showCustomerName", label: "Mostrar nombre del cliente" },
    { key: "showCustomerPhone", label: "Mostrar teléfono del cliente" },
    { key: "showDeliveryAddress", label: "Mostrar dirección de entrega" },
    { key: "showCreatedAt", label: "Mostrar fecha de creación" },
    { key: "showUpdatedAt", label: "Mostrar fecha de actualización" },
    { key: "showScheduledAt", label: "Mostrar fecha/hora programada" },
    { key: "showClosedAt", label: "Mostrar fecha de cierre" },
    { key: "showCurrentStatus", label: "Mostrar estado actual" },
    { key: "showStatusHistory", label: "Mostrar historial de estados" },
    { key: "showPublicComments", label: "Mostrar notas públicas" },
    { key: "showDynamicFields", label: "Mostrar campos dinámicos" },
    { key: "showDynamicFieldUpdatedAt", label: "Mostrar 'Actualizado' en dinámicos" },
    { key: "showTos", label: "Mostrar Términos y condiciones" },
    { key: "showSocialLinks", label: "Mostrar links sociales" },
    { key: "showPoweredBy", label: "Mostrar Powered by" },
  ] as const;


  return (
    <>
      {/* ─── Perfil del negocio ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-4 pb-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Perfil del Negocio</h3>
            <p className="text-sm text-muted-foreground">Información general y preferencias</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveConfig} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre del Negocio</Label>
                <Input
                  value={config.businessName}
                  onChange={(e) => setConfig({ ...config, businessName: e.target.value })}
                  placeholder="Ej: Mi Emprendimiento S.A."
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Negocio</Label>
                <Input
                  value={config.businessType}
                  onChange={(e) => setConfig({ ...config, businessType: e.target.value })}
                  placeholder="Ej: Gastronomía, Indumentaria, Servicios..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={config.currency} onValueChange={(v) => setConfig({ ...config, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS (Peso Argentino)</SelectItem>
                    <SelectItem value="USD">USD (Dólar)</SelectItem>
                    <SelectItem value="EUR">EUR (Euro)</SelectItem>
                    <SelectItem value="MXN">MXN (Peso Mexicano)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Duración del enlace de seguimiento
                  <span className="text-xs text-muted-foreground ml-1">
                    (entre {minHours}h y {maxHours}h)
                  </span>
                </Label>
                <Input
                  type="number"
                  min={minHours}
                  max={maxHours}
                  value={config.trackingExpirationHours}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value);
                    if (Number.isNaN(raw)) {
                      setTrackingHoursError("");
                      setConfig({ ...config, trackingExpirationHours: minHours });
                      return;
                    }
                    if (raw > maxHours) {
                      setTrackingHoursError(`Máximo permitido: ${maxHours}h`);
                    } else if (raw < minHours) {
                      setTrackingHoursError(`Mínimo permitido: ${minHours}h`);
                    } else {
                      setTrackingHoursError("");
                    }
                    setConfig({
                      ...config,
                      trackingExpirationHours: Math.min(Math.max(raw, minHours), maxHours),
                    });
                  }}
                />
                {trackingHoursError ? (
                  <p className="text-xs text-destructive">{trackingHoursError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{trackingPlanText}</p>
                )}
              </div>
            </div>

            <Button type="submit" disabled={savingConfig}>
              <Save className="w-4 h-4 mr-2" />
              {savingConfig ? "Guardando..." : "Guardar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Branding + Tracking Preview (2 columnas) ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-4 pb-2">
          <Palette className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Branding y seguimiento</h3>
            <p className="text-sm text-muted-foreground">Logo, colores, textos y links — la vista previa se actualiza mientras editás</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveBranding} className="space-y-5">
            {/* 2-col: form left, preview right */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

              {/* Left: all branding fields */}
              <div className="space-y-5">
                {/* Logo */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <Avatar className="h-16 w-16">
                    {brandingForm.logoUrl ? (
                      <AvatarImage src={brandingForm.logoUrl} alt="Logo" />
                    ) : null}
                    <AvatarFallback className="text-lg">
                      {brandingForm.displayName ? brandingForm.displayName.charAt(0).toUpperCase() : "N"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <Label className="text-sm">Logo del Negocio</Label>
                    <input
                      ref={tenantLogoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleTenantLogoUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={brandingUploading}
                      onClick={() => tenantLogoInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {brandingUploading ? "Subiendo..." : "Subir Logo"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Nombre visible</Label>
                  <Input
                    value={brandingForm.displayName}
                    onChange={(e) => setBrandingForm({ ...brandingForm, displayName: e.target.value })}
                    placeholder="Nombre visible del negocio"
                  />
                </div>

                {/* Paleta de colores */}
                <div className="space-y-3">
                  <Label>Paleta de colores</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: "primary", label: "Primario" },
                      { key: "secondary", label: "Secundario" },
                      { key: "accent", label: "Acento" },
                      { key: "background", label: "Fondo" },
                      { key: "text", label: "Texto" },
                      { key: "trackingButton", label: "Botón del seguimiento" },
                      { key: "trackingHeader", label: "Encabezado del seguimiento" },
                      { key: "trackingBadge", label: "Badge del seguimiento" },
                    ].map((item) => (
                      <div key={item.key} className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{item.label}</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={(brandingForm.colors as any)[item.key]}
                            onChange={(e) =>
                              setBrandingForm({
                                ...brandingForm,
                                colors: { ...brandingForm.colors, [item.key]: e.target.value },
                              })
                            }
                            className="w-10 h-9 p-1 cursor-pointer"
                          />
                          <Input
                            value={(brandingForm.colors as any)[item.key]}
                            onChange={(e) =>
                              setBrandingForm({
                                ...brandingForm,
                                colors: { ...brandingForm.colors, [item.key]: e.target.value },
                              })
                            }
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Textos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Encabezado del seguimiento</Label>
                    <Input
                      value={brandingForm.texts.trackingHeader}
                      onChange={(e) =>
                        setBrandingForm({
                          ...brandingForm,
                          texts: { ...brandingForm.texts, trackingHeader: e.target.value },
                        })
                      }
                      placeholder="Ej: ¡Gracias por tu pedido!"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto Términos y condiciones</Label>
                    <Input
                      value={brandingForm.texts.trackingFooter}
                      placeholder="Ej: Al realizar tu pedido aceptás nuestros Términos y condiciones."
                      onChange={(e) =>
                        setBrandingForm({
                          ...brandingForm,
                          texts: { ...brandingForm.texts, trackingFooter: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                {/* Links */}
                {!isEconomic ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Instagram</Label>
                      <Input
                        value={brandingForm.links.instagram || ""}
                        onChange={(e) =>
                          setBrandingForm({
                            ...brandingForm,
                            links: { ...brandingForm.links, instagram: e.target.value },
                          })
                        }
                        onBlur={(e) => {
                          let val = e.target.value.trim();
                          if (!val) return;
                          if (!val.startsWith("http")) {
                            if (val.includes("instagram.com/")) {
                              val = "https://" + val;
                            } else {
                              val = "https://instagram.com/" + val.replace(/^@/, '');
                            }
                          }
                          setBrandingForm({
                            ...brandingForm,
                            links: { ...brandingForm.links, instagram: val },
                          });
                        }}
                        placeholder="https://instagram.com/tu_marca"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>WhatsApp</Label>
                      <Input
                        value={brandingForm.links.whatsapp || ""}
                        onChange={(e) =>
                          setBrandingForm({
                            ...brandingForm,
                            links: { ...brandingForm.links, whatsapp: e.target.value },
                          })
                        }
                        onBlur={(e) => {
                          let val = e.target.value.trim();
                          if (!val) return;
                          if (!val.startsWith("http")) {
                            const num = val.replace(/\D/g, "");
                            val = "https://wa.me/" + num;
                          }
                          setBrandingForm({
                            ...brandingForm,
                            links: { ...brandingForm.links, whatsapp: val },
                          });
                        }}
                        placeholder="Ej: 5491112345678"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Sitio Web</Label>
                      <Input
                        value={brandingForm.links.web || ""}
                        onChange={(e) =>
                          setBrandingForm({
                            ...brandingForm,
                            links: { ...brandingForm.links, web: e.target.value },
                          })
                        }
                        onBlur={(e) => {
                          let val = e.target.value.trim();
                          if (!val) return;
                          if (!val.startsWith("http")) {
                            val = "https://" + val;
                          }
                          setBrandingForm({
                            ...brandingForm,
                            links: { ...brandingForm.links, web: val },
                          });
                        }}
                        placeholder="https://www.tuecommerce.com"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    Los enlaces externos (Instagram, WhatsApp, Web) están disponibles en planes superiores.
                  </div>
                )}

                {/* PDF logo toggle */}
                <div className="flex items-center gap-3">
                  <Switch
                    checked={brandingForm.pdfConfig.showLogo ?? true}
                    onCheckedChange={(checked) =>
                      setBrandingForm({
                        ...brandingForm,
                        pdfConfig: { ...brandingForm.pdfConfig, showLogo: checked },
                      })
                    }
                  />
                  <span className="text-sm text-muted-foreground">Mostrar logo en PDF</span>
                </div>

                {/* Layout del tracking */}
                <div className="space-y-3">
                  <Label>Diseño del seguimiento</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {layoutPresets.map((preset) => {
                      const isSelected = config.trackingLayout === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => setConfig({ ...config, trackingLayout: preset.value })}
                          className={`rounded-md border p-3 text-center transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}
                        >
                          <preset.Icon
                            className="w-6 h-6 mx-auto mb-1.5"
                            style={{ color: isSelected ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                          />
                          <p className={`text-xs font-medium ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                            {preset.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{preset.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Vista pública de seguimiento */}
                <div className="space-y-3 rounded-lg border p-4">
                  <div>
                    <Label>Vista pública de seguimiento</Label>
                    <p className="text-xs text-muted-foreground mt-1">Definí exactamente qué campos base se muestran en el link público.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {trackingFieldToggles.map((item) => (
                      <label key={item.key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <span className="text-sm">{item.label}</span>
                        <Switch
                          checked={Boolean((brandingForm as any).trackingConfig?.[item.key])}
                          onCheckedChange={(checked) =>
                            setBrandingForm((prev) => ({
                              ...prev,
                              trackingConfig: { ...prev.trackingConfig, [item.key]: checked },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Regla: si desactivás “estado actual” e “historial”, no se mostrará información de estados.
                  </p>
                </div>

                {/* Save buttons */}
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={brandingSaving}>
                    <Save className="w-4 h-4 mr-2" />
                    {brandingSaving ? "Guardando..." : "Guardá la personalización"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetBranding} disabled={brandingSaving}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Restaurar por defecto
                  </Button>
                </div>
              </div>

              {/* Right: Live Tracking Preview */}
              <div className="sticky top-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Vista previa del seguimiento</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Se actualiza mientras editás</p>
                </div>
                <div className="border rounded-xl overflow-hidden bg-muted/5" style={{ maxHeight: 680 }}>
                  <div className="overflow-y-auto" style={{ maxHeight: 680 }}>
                    <TrackingView branding={brandingForm} order={previewOrder} mode="preview" />
                  </div>
                </div>
                {/* Open in new tab (only if tenant has a slug — graceful degradation) */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Ir a la vista previa
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
