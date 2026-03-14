import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Download, FileText } from "lucide-react";

type Period = "today" | "week" | "month" | "year" | "custom";

const money = (n: number) => `$${Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

function getDatesForYear() {
  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [pdfSections, setPdfSections] = useState({
    includeSummary: true,
    includeTopProducts: true,
    includeLowProducts: true,
    includeCategories: true,
    includeAnalysis: true,
  });

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (period === "year") {
      q.set("period", "custom");
      const y = getDatesForYear();
      q.set("from", y.from);
      q.set("to", y.to);
    } else {
      q.set("period", period === "custom" ? "custom" : period);
      if (period === "custom" && customFrom && customTo) {
        q.set("from", customFrom);
        q.set("to", customTo);
      }
    }
    return q.toString();
  }, [period, customFrom, customTo]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reports-overview", query],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/overview?${query}`);
      return res.json();
    },
  });

  async function exportReport(format: "pdf" | "xlsx") {
    try {
      setExporting(format);
      const res = await apiRequest("POST", "/api/reports/export", {
        type: "overview",
        format,
        params: { ...(period === "custom" && customFrom && customTo ? { from: customFrom, to: customTo } : {}), period, ...(format === "pdf" ? pdfSections : {}) },
      });
      const body = await res.json();
      if (body?.url) window.open(body.url, "_blank");
    } finally {
      setExporting(null);
    }
  }

  const overview = data?.data;
  const salesTotal = Number(overview?.summary?.salesTotal || 0);
  const salesCount = Number(overview?.summary?.salesCount || 0);
  const avgTicket = Number(overview?.summary?.avgTicket || 0);
  const comparison = Number(overview?.summary?.growthPct || 0);
  const topProducts = overview?.topProducts || [];
  const lowProducts = overview?.lowProducts || [];
  const categories = overview?.categoryRevenue || [];
  const trend = overview?.movementByWeekday || [];

  const concentrationPct = Number(overview?.summary?.concentrationPct || 0);
  const ordersCount = Number(overview?.summary?.ordersCount || 0);
  const conversionRate = ordersCount > 0 ? (salesCount / ordersCount) * 100 : 0;
  const strongestCategory = categories.length ? categories[0] : null;
  const weakestCategory = categories.length ? categories[categories.length - 1] : null;
  const bestDay = trend.length ? [...trend].sort((a: any, b: any) => Number(b.count || 0) - Number(a.count || 0))[0] : null;


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes de ventas</h1>
          <p className="text-sm text-muted-foreground">Datos reales para ingresos, rotación y rendimiento del período.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>Período</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mes</SelectItem>
                <SelectItem value="year">Año</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div><Label>Desde</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
              <div><Label>Hasta</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
            </>
          )}
          <div className="flex items-end"><Button onClick={() => refetch()}>Actualizar</Button></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Exportar Reporte PDF
            </CardTitle>
            <CardDescription>Seleccioná qué información querés incluir en el documento.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              {[
                { key: "includeSummary", label: "Resumen ejecutivo", desc: "Totales de ingresos, tickets y crecimiento" },
                { key: "includeTopProducts", label: "Productos más vendidos", desc: "Top de los productos estrella del período" },
                { key: "includeLowProducts", label: "Productos menos vendidos", desc: "Los de más difícil salida y rotación" },
                { key: "includeCategories", label: "Desempeño por Categorías", desc: "Qué rubros generaron más dinero" },
                { key: "includeAnalysis", label: "Análisis e Insights", desc: "Conclusiones automáticas sobre tus ventas" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex flex-row items-center justify-between rounded-lg border p-3 hover:bg-muted/10 transition-colors">
                  <div className="space-y-0.5 min-w-0 mr-4">
                    <Label className="text-sm font-medium cursor-pointer" htmlFor={key}>{label}</Label>
                    <p className="text-[12px] text-muted-foreground truncate">{desc}</p>
                  </div>
                  <Switch
                    id={key}
                    checked={(pdfSections as any)[key]}
                    onCheckedChange={(checked) => setPdfSections((prev) => ({ ...prev, [key]: checked }))}
                  />
                </div>
              ))}
            </div>
            
            <div className="mt-6 flex flex-col sm:flex-row gap-3 pt-4 border-t">
              <Button onClick={() => exportReport("pdf")} disabled={!!exporting} className="w-full sm:w-auto">
                <Download className="h-4 w-4 mr-2" />
                {exporting === "pdf" ? "Generando PDF..." : "Generar Reporte PDF"}
              </Button>
              <Button variant="outline" onClick={() => exportReport("xlsx")} disabled={!!exporting} className="w-full sm:w-auto">
                <Download className="h-4 w-4 mr-2 text-emerald-600" />
                {exporting === "xlsx" ? "Generando Excel..." : "Bajar datos crudos (Excel)"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {isError && <Card><CardContent className="pt-6 text-red-600 flex gap-2"><AlertCircle className="h-4 w-4" />No se pudo cargar el reporte.</CardContent></Card>}
      {isLoading && <Card><CardContent className="pt-6 text-sm text-muted-foreground">Cargando reporte...</CardContent></Card>}

      {!isLoading && !isError && (
        <>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-5">
            <Card><CardHeader><CardTitle className="text-sm">Ingresos</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{money(salesTotal)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Ventas/Pedidos</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{salesCount}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Ticket promedio</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{money(avgTicket)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Vs período anterior</CardTitle></CardHeader><CardContent className={`text-2xl font-semibold ${comparison < 0 ? "text-red-600" : "text-green-600"}`}>{comparison.toFixed(1)}%</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Conversión pedido → venta</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{ordersCount > 0 ? `${conversionRate.toFixed(1)}%` : "-"}</CardContent></Card>
          </div>

          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Más vendidos</CardTitle></CardHeader><CardContent className="space-y-2">{topProducts.length ? topProducts.map((p: any) => <div key={p.name} className="flex justify-between text-sm"><span>{p.name}</span><span>{p.qtySold} u · {money(p.revenue)}</span></div>) : <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>}</CardContent></Card>
            <Card><CardHeader><CardTitle>Menos vendidos</CardTitle></CardHeader><CardContent className="space-y-2">{lowProducts.length ? lowProducts.map((p: any) => <div key={p.name} className="flex justify-between text-sm"><span>{p.name}</span><span>{p.qtySold} u · {money(p.revenue)}</span></div>) : <p className="text-sm text-muted-foreground">Sin datos de baja rotación.</p>}</CardContent></Card>
          </div>

          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Ingresos por categoría</CardTitle></CardHeader><CardContent className="space-y-2">{categories.length ? categories.map((c: any) => <div key={c.category} className="flex justify-between text-sm"><span>{c.category}</span><span>{money(c.revenue)}</span></div>) : <p className="text-sm text-muted-foreground">Sin categorías registradas.</p>}</CardContent></Card>
            <Card><CardHeader><CardTitle>Comportamiento por día</CardTitle></CardHeader><CardContent className="space-y-2">{trend.length ? trend.map((t: any) => <div key={t.dow} className="flex justify-between text-sm"><span>{t.dow}</span><span>{t.count} ventas</span></div>) : <p className="text-sm text-muted-foreground">Sin evolución para el período.</p>}</CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Insights automáticos</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {comparison < 0 && <p>• Las ventas cayeron contra el período anterior ({comparison.toFixed(1)}%).</p>}
              {concentrationPct >= 60 && <p>• Hay concentración alta: el top 3 aporta {concentrationPct.toFixed(1)}% de ingresos.</p>}
              {lowProducts.length > 0 && <p>• {lowProducts.length} productos muestran baja rotación en el período.</p>}
              {strongestCategory && <p>• Categoría más fuerte: <strong>{strongestCategory.category}</strong> ({money(strongestCategory.revenue)}).</p>}
              {weakestCategory && categories.length > 1 && <p>• Categoría con menor aporte: <strong>{weakestCategory.category}</strong> ({money(weakestCategory.revenue)}).</p>}
              {bestDay && <p>• Día con mayor movimiento: <strong>{bestDay.dow}</strong> ({bestDay.count} ventas).</p>}
              {ordersCount > 0 && conversionRate < 70 && <p>• Conversión pedido → venta baja ({conversionRate.toFixed(1)}%). Revisá seguimiento de pedidos pendientes.</p>}
              {comparison >= 0 && concentrationPct < 60 && lowProducts.length === 0 && <p>Sin alertas relevantes para este período.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
