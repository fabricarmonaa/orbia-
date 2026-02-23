import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowUp, ArrowDown, RefreshCcw, Download, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/lib/plan";
import {
  getPdfSettings,
  updatePdfSettings,
  resetPdfSettings,
  fetchPdfPreview,
  getPdfDownloadUrl,
  downloadPdfWithAuth,
  type PdfSettings,
  type PdfColumnKey,
  type PdfDocumentType,
  type InvoiceColumnKey,
} from "@/lib/pdfs";

const columnLabels: Record<PdfColumnKey, string> = {
  name: "Producto",
  sku: "SKU",
  description: "Descripción",
  price: "Precio",
  stock_total: "Stock total",
  branch_stock: "Stock por sucursal",
};

const priceListTemplateOptions = [
  { value: "CLASSIC", label: "Clásico" },
  { value: "MODERN", label: "Moderno" },
  { value: "MINIMAL", label: "Minimal" },
];

const invoiceTemplateOptions = [
  { value: "B_STANDARD", label: "B estándar" },
  { value: "B_COMPACT", label: "B compacto" },
];

const invoiceColumnLabels: Record<InvoiceColumnKey, string> = {
  code: "Código",
  quantity: "Cantidad",
  product: "Producto",
  price: "Precio",
  discount: "Bonif",
  total: "Importe",
};

export function PriceListPdfSettings() {
  const [settings, setSettings] = useState<PdfSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewKey, setPreviewKey] = useState(Date.now());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const { toast } = useToast();
  const { plan, loading: loadingPlan } = usePlan();
  const isEscala = (plan?.planCode || "").toUpperCase() === "ESCALA";
  const isEconomic = (plan?.planCode || "").toUpperCase() === "ECONOMICO";

  useEffect(() => {
    if (loadingPlan) return;
    fetchSettings();
  }, [loadingPlan, isEscala, isEconomic]);

  async function fetchSettings() {
    try {
      const data = await getPdfSettings();
      if (!isEscala && data.documentType === "INVOICE_B") data.documentType = "PRICE_LIST";
      if (data.documentType === "INVOICE_B" && !["B_STANDARD", "B_COMPACT"].includes(data.templateKey)) {
        data.templateKey = "B_STANDARD";
      }
      if (data.documentType === "PRICE_LIST" && !["CLASSIC", "MODERN", "MINIMAL"].includes(data.templateKey)) {
        data.templateKey = "CLASSIC";
      }
      if (isEconomic) data.showLogo = false;
      setSettings(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!settings) return;
    let active = true;
    setLoadingPreview(true);
    fetchPdfPreview(settings.documentType as PdfDocumentType)
      .then((blob) => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch((err: any) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });
    return () => {
      active = false;
    };
  }, [settings?.documentType, previewKey]);

  useEffect(() => {
    if (!settings) return;
    const isInvoice = settings.documentType === "INVOICE_B";
    const allowed = isInvoice ? ["B_STANDARD", "B_COMPACT"] : ["CLASSIC", "MODERN", "MINIMAL"];
    if (!allowed.includes(settings.templateKey)) {
      setSettings({ ...settings, templateKey: isInvoice ? "B_STANDARD" : "CLASSIC" });
    }
  }, [settings]);

  function updateColumnOrder(listKey: "columns" | "invoiceColumns", index: number, direction: "up" | "down") {
    if (!settings) return;
    const next = [...settings[listKey]];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSettings({ ...settings, [listKey]: next });
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const data = await updatePdfSettings(settings);
      setSettings(data);
      toast({ title: "PDF guardado" });
      setPreviewKey(Date.now());
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function resetSettings() {
    if (!confirm("¿Restaurar configuración por defecto?")) return;
    setSaving(true);
    try {
      const data = await resetPdfSettings();
      setSettings(data);
      toast({ title: "Restaurado a valores por defecto" });
      setPreviewKey(Date.now());
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    if (!settings) return;
    try {
      await downloadPdfWithAuth(getPdfDownloadUrl(settings.documentType), "documento.pdf");
      toast({ title: "PDF descargado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  if (loading || !settings) {
    return null;
  }

  const isInvoice = settings.documentType === "INVOICE_B";
  const availableTemplates = isInvoice ? invoiceTemplateOptions : priceListTemplateOptions;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">PDFs del negocio</h3>
            <p className="text-sm text-muted-foreground">Configura diseño, columnas y preview</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewKey(Date.now())} data-testid="button-refresh-pdf-preview">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Actualizar preview
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Descargar PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Tipo de documento</Label>
                <Select
                  value={settings.documentType}
                  onValueChange={(value) => setSettings({ ...settings, documentType: value as PdfDocumentType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRICE_LIST">Lista de precios</SelectItem>
                    {isEscala && <SelectItem value="INVOICE_B">Factura B</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select
                  value={settings.templateKey}
                  onValueChange={(value) => setSettings({ ...settings, templateKey: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tamaño de página</Label>
                <Select
                  value={settings.pageSize}
                  onValueChange={(value) => setSettings({ ...settings, pageSize: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="LETTER">Carta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Orientación</Label>
                <Select
                  value={settings.orientation}
                  onValueChange={(value) => setSettings({ ...settings, orientation: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Vertical</SelectItem>
                    <SelectItem value="landscape">Horizontal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Encabezado</Label>
                <Input
                  value={settings.headerText || ""}
                  onChange={(e) => setSettings({ ...settings, headerText: e.target.value })}
                  placeholder="Ej: Lista de Precios Mayorista"
                />
              </div>
              <div className="space-y-2">
                <Label>Sub-encabezado</Label>
                <Input
                  value={settings.subheaderText || ""}
                  onChange={(e) => setSettings({ ...settings, subheaderText: e.target.value })}
                  placeholder="Ej: Vigencia Marzo 2024"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Footer</Label>
                <Input
                  value={settings.footerText || ""}
                  onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
                  placeholder="Ej: Precios sujetos a cambios sin previo aviso - www.miempresa.com"
                />
              </div>
            </div>

            {isInvoice && (
              <>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título del documento</Label>
                    <Input
                      value={settings.documentTitle || ""}
                      onChange={(e) => setSettings({ ...settings, documentTitle: e.target.value })}
                      placeholder="Ej: FACTURA B"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Razón social</Label>
                    <Input
                      value={settings.fiscalName || ""}
                      onChange={(e) => setSettings({ ...settings, fiscalName: e.target.value })}
                      placeholder="Ej: Mi Empresa S.A."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CUIT</Label>
                    <Input
                      value={settings.fiscalCuit || ""}
                      onChange={(e) => setSettings({ ...settings, fiscalCuit: e.target.value })}
                      placeholder="Ej: 30-12345678-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>IIBB</Label>
                    <Input
                      value={settings.fiscalIibb || ""}
                      onChange={(e) => setSettings({ ...settings, fiscalIibb: e.target.value })}
                      placeholder="Ej: 901-123456-1"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Domicilio</Label>
                    <Input
                      value={settings.fiscalAddress || ""}
                      onChange={(e) => setSettings({ ...settings, fiscalAddress: e.target.value })}
                      placeholder="Ej: Calle 123, Piso 1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ciudad</Label>
                    <Input
                      value={settings.fiscalCity || ""}
                      onChange={(e) => setSettings({ ...settings, fiscalCity: e.target.value })}
                      placeholder="Ej: CABA, Buenos Aires"
                    />
                  </div>
                  <div className="flex items-center gap-3 sm:col-span-2">
                    <Switch
                      checked={settings.showFooterTotals ?? true}
                      onCheckedChange={(checked) => setSettings({ ...settings, showFooterTotals: checked })}
                    />
                    <span className="text-sm text-muted-foreground">Mostrar total al pie</span>
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!isInvoice && (
                <div className="space-y-2">
                  <Label>Etiqueta precio</Label>
                  <Input
                    value={settings.priceColumnLabel}
                    onChange={(e) => setSettings({ ...settings, priceColumnLabel: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Símbolo moneda</Label>
                <Input
                  value={settings.currencySymbol}
                  onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={settings.showLogo}
                  onCheckedChange={(checked) => setSettings({ ...settings, showLogo: checked })}
                />
                <span className="text-sm text-muted-foreground">Mostrar logo</span>
              </div>
              {!isInvoice && (
                <>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={settings.showDescription}
                      onCheckedChange={(checked) => setSettings({ ...settings, showDescription: checked })}
                    />
                    <span className="text-sm text-muted-foreground">Mostrar descripción</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={settings.showSku}
                      onCheckedChange={(checked) => setSettings({ ...settings, showSku: checked })}
                    />
                    <span className="text-sm text-muted-foreground">Mostrar SKU</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={settings.showBranchStock}
                      onCheckedChange={(checked) => setSettings({ ...settings, showBranchStock: checked })}
                    />
                    <span className="text-sm text-muted-foreground">Stock por sucursal</span>
                  </div>
                </>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Orden de columnas</Label>
              <div className="space-y-2">
                {(isInvoice ? settings.invoiceColumns : settings.columns).map((col, index) => (
                  <div key={col} className="flex items-center justify-between border rounded-md px-3 py-2">
                    <span className="text-sm">
                      {isInvoice
                        ? invoiceColumnLabels[col as InvoiceColumnKey]
                        : columnLabels[col as PdfColumnKey]}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => updateColumnOrder(isInvoice ? "invoiceColumns" : "columns", index, "up")}
                        disabled={index === 0}
                      >
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => updateColumnOrder(isInvoice ? "invoiceColumns" : "columns", index, "down")}
                        disabled={index === (isInvoice ? settings.invoiceColumns.length : settings.columns.length) - 1}
                      >
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={saveSettings} disabled={saving} data-testid="button-save-pdf-settings">
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Guardando..." : "Guardar PDF"}
              </Button>
              <Button variant="outline" onClick={resetSettings} disabled={saving}>
                Restaurar defaults
              </Button>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden h-[520px] flex items-center justify-center bg-muted/20">
            {loadingPreview && (
              <p className="text-sm text-muted-foreground">Generando preview...</p>
            )}
            {!loadingPreview && previewUrl && (
              <iframe title="Preview PDF" src={previewUrl} className="w-full h-full" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
