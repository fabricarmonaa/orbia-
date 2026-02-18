import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Palette, Save, Upload, Eye, Settings } from "lucide-react";
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
  setBrandingForm: (value: TenantBranding) => void;
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
  const isEconomic = (planCode || "").toUpperCase() === "ECONOMICO";
  return (
    <>
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
                  placeholder="Mi Negocio"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Negocio</Label>
                <Input
                  value={config.businessType}
                  onChange={(e) => setConfig({ ...config, businessType: e.target.value })}
                  placeholder="Ej: Comercio, Servicio"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descripción del Negocio</Label>
              <Textarea
                value={config.businessDescription}
                onChange={(e) => setConfig({ ...config, businessDescription: e.target.value })}
                placeholder="Breve descripción de tu negocio..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={config.currency} onValueChange={(v) => setConfig({ ...config, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS (Peso Argentino)</SelectItem>
                    <SelectItem value="USD">USD (Dólar)</SelectItem>
                    <SelectItem value="EUR">EUR (Euro)</SelectItem>
                    <SelectItem value="MXN">MXN (Peso Mexicano)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Idioma</Label>
                <Select value={config.language} onValueChange={(v) => setConfig({ ...config, language: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  Tracking (horas)
                  <span className="text-xs text-muted-foreground ml-1">
                    ({minTrackingHours}-{maxTrackingHours}h)
                  </span>
                </Label>
                <Input
                  type="number"
                  min={minTrackingHours}
                  max={maxTrackingHours}
                  value={config.trackingExpirationHours}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || minTrackingHours;
                    setConfig({
                      ...config,
                      trackingExpirationHours: Math.min(Math.max(v, minTrackingHours), maxTrackingHours),
                    });
                  }}
                />
              </div>
            </div>
            <Button type="submit" disabled={savingConfig}>
              <Save className="w-4 h-4 mr-2" />
              {savingConfig ? "Guardando..." : "Guardar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4 pb-2">
          <Palette className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Branding</h3>
            <p className="text-sm text-muted-foreground">Logo, colores, textos y links</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={saveBranding} className="space-y-5">
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

            <div className="space-y-3">
              <Label>Paleta de colores</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: "primary", label: "Primario" },
                  { key: "secondary", label: "Secundario" },
                  { key: "accent", label: "Acento" },
                  { key: "background", label: "Fondo" },
                  { key: "text", label: "Texto" },
                  { key: "trackingButton", label: "Tracking: Botón" },
                  { key: "trackingHeader", label: "Tracking: Header" },
                  { key: "trackingBadge", label: "Tracking: Badge" },
                ].map((item) => (
                  <div key={item.key} className="space-y-2">
                    <Label>{item.label}</Label>
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
                        className="flex-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Texto header tracking</Label>
                <Input
                  value={brandingForm.texts.trackingHeader}
                  onChange={(e) =>
                    setBrandingForm({
                      ...brandingForm,
                      texts: { ...brandingForm.texts, trackingHeader: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Texto footer tracking</Label>
                <Input
                  value={brandingForm.texts.trackingFooter}
                  onChange={(e) =>
                    setBrandingForm({
                      ...brandingForm,
                      texts: { ...brandingForm.texts, trackingFooter: e.target.value },
                    })
                  }
                />
              </div>
            </div>

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
                    placeholder="https://instagram.com/tu_negocio"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Whatsapp</Label>
                  <Input
                    value={brandingForm.links.whatsapp || ""}
                    onChange={(e) =>
                      setBrandingForm({
                        ...brandingForm,
                        links: { ...brandingForm.links, whatsapp: e.target.value },
                      })
                    }
                    placeholder="+54911xxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Web</Label>
                  <Input
                    value={brandingForm.links.web || ""}
                    onChange={(e) =>
                      setBrandingForm({
                        ...brandingForm,
                        links: { ...brandingForm.links, web: e.target.value },
                      })
                    }
                    placeholder="https://tusitio.com"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Tu plan actual incluye personalización de colores, logo y textos. Los enlaces externos están disponibles en planes superiores.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PDF: Encabezado</Label>
                <Input
                  value={brandingForm.pdfConfig.headerText || ""}
                  onChange={(e) =>
                    setBrandingForm({
                      ...brandingForm,
                      pdfConfig: { ...brandingForm.pdfConfig, headerText: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>PDF: Footer</Label>
                <Input
                  value={brandingForm.pdfConfig.footerText || ""}
                  onChange={(e) =>
                    setBrandingForm({
                      ...brandingForm,
                      pdfConfig: { ...brandingForm.pdfConfig, footerText: e.target.value },
                    })
                  }
                />
              </div>
            </div>

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

            <div className="space-y-3">
              <Label>Diseño del Tracking</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {layoutPresets.map((preset) => {
                  const isSelected = config.trackingLayout === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setConfig({ ...config, trackingLayout: preset.value })}
                      className={`rounded-md border p-3 text-center transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border"
                      }`}
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

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={brandingSaving}>
                <Save className="w-4 h-4 mr-2" />
                {brandingSaving ? "Guardando..." : "Guardar Personalización"}
              </Button>
              <Button type="button" variant="outline" onClick={resetBranding} disabled={brandingSaving}>
                Restaurar valores por defecto
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4 pb-2">
          <Eye className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Vista Previa del Tracking</h3>
            <p className="text-sm text-muted-foreground">Así se verá la página de tracking para tus clientes</p>
          </div>
        </CardHeader>
        <CardContent>
          <TrackingView branding={brandingForm} order={previewOrder} mode="preview" />
        </CardContent>
      </Card>
    </>
  );
}
