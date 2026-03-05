/**
 * Configuración de PDFs — Lista de Precios y Presupuesto
 * Reemplaza la antigua "Factura B" con una pestaña de configuración de Presupuesto.
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getPdfSettings, updatePdfSettings, resetPdfSettings, type PdfSettings } from "@/lib/pdfs";
import { Loader2, RotateCcw, Save, FileText, List } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────
type ColumnKey = "name" | "sku" | "description" | "price" | "stock_total" | "branch_stock";

const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: "Nombre del producto",
  sku: "Código (SKU)",
  description: "Descripción",
  price: "Precio",
  stock_total: "Stock total",
  branch_stock: "Stock por sucursal",
};

const ALL_COLUMNS: ColumnKey[] = ["name", "sku", "description", "price", "stock_total", "branch_stock"];

// ── Live PDF Preview ─────────────────────────────────────────────
function PdfPreview({ type }: { type: "price_list" | "presupuesto" }) {
  const today = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const priceListItems = [
    { name: "Producto Ejemplo A", sku: "SKU-001", price: "$1.500,00", stock: "12" },
    { name: "Servicio Ejemplo B", sku: "SKU-002", price: "$3.200,00", stock: "—" },
    { name: "Producto Ejemplo C", sku: "SKU-003", price: "$850,00", stock: "5" },
  ];

  const quoteItems = [
    { name: "Producto Ejemplo A", qty: "2", price: "$1.500,00", subtotal: "$3.000,00" },
    { name: "Servicio Ejemplo B", qty: "1", price: "$3.200,00", subtotal: "$3.200,00" },
  ];

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden font-sans text-sm">
      {/* Header */}
      <div className="bg-slate-800 px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-base">Mi Negocio</p>
          <p className="text-slate-300 text-xs">Slogan o descripción</p>
        </div>
        <p className="text-slate-400 text-xs">{today}</p>
      </div>

      {/* Title bar */}
      <div className="bg-slate-700 px-5 py-1.5">
        <p className="text-white font-semibold text-xs tracking-wide">
          {type === "price_list" ? "LISTA DE PRECIOS" : "PRESUPUESTO"}
        </p>
      </div>

      {/* Customer row (presupuesto only) */}
      {type === "presupuesto" && (
        <div className="bg-slate-50 border-b px-5 py-2 text-xs text-slate-600">
          Cliente: Juan Pérez  ·  Tel: 11 1234-5678  ·  Validez: 7 días
        </div>
      )}

      {/* Table */}
      <div className="px-5 pt-3 pb-4">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {type === "price_list" ? (
                <>
                  <th className="border border-slate-300 bg-slate-800 text-white px-2 py-1.5 text-left font-semibold">Producto / Servicio</th>
                  <th className="border border-slate-300 bg-slate-800 text-white px-2 py-1.5 text-left font-semibold">Descripción</th>
                  <th className="border border-slate-300 bg-slate-800 text-white px-2 py-1.5 text-right font-semibold">Precio</th>
                  <th className="border border-slate-300 bg-slate-800 text-white px-2 py-1.5 text-right font-semibold">Stock</th>
                </>
              ) : (
                <>
                  <th className="border border-slate-300 bg-slate-800 text-white px-2 py-1.5 text-left font-semibold">Producto / Servicio</th>
                  <th className="border border-slate-300 bg-slate-800 text-white px-2 py-1.5 text-right font-semibold">Cantidad</th>
                  <th className="border border-slate-300 bg-slate-800 text-white px-2 py-1.5 text-right font-semibold">Precio unit.</th>
                  <th className="border border-slate-300 bg-slate-800 text-white px-2 py-1.5 text-right font-semibold">Subtotal</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {type === "price_list"
              ? priceListItems.map((item, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="border border-slate-200 px-2 py-1.5 font-medium">{item.name}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-slate-500">Lorem ipsum breve</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">{item.price}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">{item.stock}</td>
                </tr>
              ))
              : quoteItems.map((item, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="border border-slate-200 px-2 py-1.5 font-medium">{item.name}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">{item.qty}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right">{item.price}</td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right font-semibold">{item.subtotal}</td>
                </tr>
              ))}
          </tbody>
        </table>

        {/* Totals (presupuesto only) */}
        {type === "presupuesto" && (
          <div className="flex justify-end mt-2 gap-1 flex-col items-end">
            <div className="flex gap-4 text-xs text-slate-500 bg-slate-50 border px-3 py-1 rounded">
              <span>Subtotal</span><span>$6.200,00</span>
            </div>
            <div className="flex gap-4 text-xs font-bold bg-slate-800 text-white px-3 py-1.5 rounded">
              <span>TOTAL</span><span>$6.200,00</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-slate-400 text-[10px] mt-4 pt-2 border-t border-slate-100">
          Términos y condiciones · Válido sujeto a disponibilidad de stock.
        </p>
      </div>
    </div>
  );
}

// ── Shared config fields ──────────────────────────────────────────
function SharedFields({
  settings,
  onChange,
}: {
  settings: Partial<PdfSettings>;
  onChange: (patch: Partial<PdfSettings>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tamaño de página</Label>
          <Select value={settings.pageSize || "A4"} onValueChange={(v) => onChange({ pageSize: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A4">A4</SelectItem>
              <SelectItem value="LETTER">Carta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Orientación</Label>
          <Select value={settings.orientation || "portrait"} onValueChange={(v) => onChange({ orientation: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">Vertical</SelectItem>
              <SelectItem value="landscape">Horizontal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Nombre del negocio / encabezado</Label>
        <Input
          value={settings.headerText || ""}
          onChange={(e) => onChange({ headerText: e.target.value })}
          placeholder="Mi Negocio"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Subtítulo / descripción breve</Label>
        <Input
          value={settings.subheaderText || ""}
          onChange={(e) => onChange({ subheaderText: e.target.value })}
          placeholder="Mayorista · Rosario"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Texto al pie del documento</Label>
        <Textarea
          rows={2}
          value={settings.footerText || ""}
          onChange={(e) => onChange({ footerText: e.target.value })}
          placeholder="Términos y condiciones · Válido sujeto a disponibilidad de stock."
        />
      </div>
      <div className="flex items-center justify-between py-1">
        <Label>Mostrar logo del negocio</Label>
        <Switch checked={!!settings.showLogo} onCheckedChange={(v) => onChange({ showLogo: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Símbolo moneda</Label>
          <Input value={settings.currencySymbol || "$"} onChange={(e) => onChange({ currencySymbol: e.target.value })} maxLength={5} />
        </div>
        <div className="space-y-1.5">
          <Label>Etiqueta columna precio</Label>
          <Input value={settings.priceColumnLabel || ""} onChange={(e) => onChange({ priceColumnLabel: e.target.value })} placeholder="Precio" />
        </div>
      </div>
    </div>
  );
}

// ── Price list specific fields ────────────────────────────────────
function PriceListFields({
  settings,
  onChange,
}: {
  settings: Partial<PdfSettings>;
  onChange: (patch: Partial<PdfSettings>) => void;
}) {
  const columns = (settings.columns as ColumnKey[]) || ["name", "description", "price", "stock_total"];

  function toggleColumn(key: ColumnKey) {
    const next = columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key];
    onChange({ columns: next as any });
  }

  return (
    <div className="space-y-4 pt-2">
      <div>
        <Label className="mb-2 block">Columnas visibles</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_COLUMNS.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => toggleColumn(col)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${columns.includes(col)
                  ? "bg-foreground text-background border-foreground"
                  : "bg-muted text-muted-foreground border-border"
                }`}
            >
              {COLUMN_LABELS[col]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label>Mostrar descripción</Label>
        <Switch checked={!!settings.showDescription} onCheckedChange={(v) => onChange({ showDescription: v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Mostrar código (SKU)</Label>
        <Switch checked={!!settings.showSku} onCheckedChange={(v) => onChange({ showSku: v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Mostrar stock por sucursal</Label>
        <Switch checked={!!settings.showBranchStock} onCheckedChange={(v) => onChange({ showBranchStock: v })} />
      </div>
    </div>
  );
}

// ── Presupuesto specific ──────────────────────────────────────────
function PresupuestoFields({
  settings,
  onChange,
}: {
  settings: Partial<PdfSettings>;
  onChange: (patch: Partial<PdfSettings>) => void;
}) {
  return (
    <div className="space-y-4 pt-2">
      <div className="rounded-lg border bg-blue-50/60 p-3 text-sm text-blue-800">
        <p className="font-semibold mb-1">¿Cómo funciona el Presupuesto?</p>
        <p className="text-xs leading-relaxed">
          El presupuesto se genera desde <strong>Productos → Seleccionar → Generar presupuesto</strong>.
          Incluye datos del cliente, cantidades, subtotal por ítem y totales con descuento.
          Configurá acá el encabezado, pie y opciones visuales que se van a aplicar en todos los presupuestos.
        </p>
      </div>
      <div className="flex items-center justify-between">
        <Label>Mostrar descripción de productos</Label>
        <Switch checked={!!settings.showDescription} onCheckedChange={(v) => onChange({ showDescription: v })} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Mostrar código (SKU)</Label>
        <Switch checked={!!settings.showSku} onCheckedChange={(v) => onChange({ showSku: v })} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function PriceListPdfSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PdfSettings | null>(null);
  const [draft, setDraft] = useState<Partial<PdfSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"price_list" | "presupuesto">("price_list");

  useEffect(() => {
    getPdfSettings()
      .then((s) => {
        setSettings(s);
        setDraft(s as any);
        if ((s.documentType as string) === "PRESUPUESTO") setActiveTab("presupuesto");
      })
      .catch(() => toast({ title: "No se pudieron cargar las configuraciones", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const merged = { ...settings, ...draft } as PdfSettings;

  function patchDraft(patch: Partial<PdfSettings>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await updatePdfSettings({
        ...draft,
        documentType: activeTab === "presupuesto" ? "PRESUPUESTO" : "PRICE_LIST",
      });
      setSettings(saved as any);
      toast({ title: "Configuración guardada" });
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("¿Restablecer configuración de PDFs a los valores predeterminados?")) return;
    setSaving(true);
    try {
      const fresh = await resetPdfSettings();
      setSettings(fresh as any);
      setDraft(fresh as any);
      toast({ title: "Configuración restablecida" });
    } catch {
      toast({ title: "Error al restablecer", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Configuración de PDFs</h2>
          <p className="text-sm text-muted-foreground">
            Personalizá cómo se ven tus listas de precios y presupuestos exportados.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Restablecer
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Guardar
          </Button>
        </div>
      </div>

      {/* Document type tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="price_list" className="flex items-center gap-1.5">
            <List className="w-4 h-4" />
            Lista de Precios
          </TabsTrigger>
          <TabsTrigger value="presupuesto" className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            Presupuesto
          </TabsTrigger>
        </TabsList>

        {/* ── PRICE LIST ── */}
        <TabsContent value="price_list">
          <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-start">
            {/* Config */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <List className="w-4 h-4" /> Lista de Precios — Opciones
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <SharedFields settings={merged} onChange={patchDraft} />
                <div className="border-t pt-4">
                  <PriceListFields settings={merged} onChange={patchDraft} />
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Vista previa</Badge>
                <p className="text-xs text-muted-foreground">Representación aproximada del PDF generado</p>
              </div>
              <PdfPreview type="price_list" />
            </div>
          </div>
        </TabsContent>

        {/* ── PRESUPUESTO ── */}
        <TabsContent value="presupuesto">
          <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-start">
            {/* Config */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Presupuesto — Opciones
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <SharedFields settings={merged} onChange={patchDraft} />
                <div className="border-t pt-4">
                  <PresupuestoFields settings={merged} onChange={patchDraft} />
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Vista previa</Badge>
                <p className="text-xs text-muted-foreground">Representación aproximada del PDF generado</p>
              </div>
              <PdfPreview type="presupuesto" />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
