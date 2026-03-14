import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Download } from "lucide-react";

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
        params: { ...(period === "custom" && customFrom && customTo ? { from: customFrom, to: customTo } : {}), period },
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes de ventas</h1>
          <p className="text-sm text-muted-foreground">Datos reales para ingresos, rotación y rendimiento del período.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportReport("pdf")} disabled={!!exporting}>
            <Download className="h-4 w-4 mr-1" /> {exporting === "pdf" ? "Exportando..." : "Exportar PDF"}
          </Button>
          <Button variant="outline" onClick={() => exportReport("xlsx")} disabled={!!exporting}>
            <Download className="h-4 w-4 mr-1" /> {exporting === "xlsx" ? "Exportando..." : "Exportar Excel"}
          </Button>
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

      {isError && <Card><CardContent className="pt-6 text-red-600 flex gap-2"><AlertCircle className="h-4 w-4" />No se pudo cargar el reporte.</CardContent></Card>}
      {isLoading && <Card><CardContent className="pt-6 text-sm text-muted-foreground">Cargando reporte...</CardContent></Card>}

      {!isLoading && !isError && (
        <>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
            <Card><CardHeader><CardTitle className="text-sm">Ingresos</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{money(salesTotal)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Ventas/Pedidos</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{salesCount}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Ticket promedio</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{money(avgTicket)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Vs período anterior</CardTitle></CardHeader><CardContent className={`text-2xl font-semibold ${comparison < 0 ? "text-red-600" : "text-green-600"}`}>{comparison.toFixed(1)}%</CardContent></Card>
          </div>

          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Más vendidos</CardTitle></CardHeader><CardContent className="space-y-2">{topProducts.length ? topProducts.map((p: any) => <div key={p.name} className="flex justify-between text-sm"><span>{p.name}</span><span>{p.qtySold} u · {money(p.revenue)}</span></div>) : <p className="text-sm text-muted-foreground">Sin ventas en el período.</p>}</CardContent></Card>
            <Card><CardHeader><CardTitle>Menos vendidos</CardTitle></CardHeader><CardContent className="space-y-2">{lowProducts.length ? lowProducts.map((p: any) => <div key={p.name} className="flex justify-between text-sm"><span>{p.name}</span><span>{p.qtySold} u · {money(p.revenue)}</span></div>) : <p className="text-sm text-muted-foreground">Sin datos de baja rotación.</p>}</CardContent></Card>
          </div>

          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Ingresos por categoría</CardTitle></CardHeader><CardContent className="space-y-2">{categories.length ? categories.map((c: any) => <div key={c.category} className="flex justify-between text-sm"><span>{c.category}</span><span>{money(c.revenue)}</span></div>) : <p className="text-sm text-muted-foreground">Sin categorías registradas.</p>}</CardContent></Card>
            <Card><CardHeader><CardTitle>Evolución temporal</CardTitle></CardHeader><CardContent className="space-y-2">{trend.length ? trend.map((t: any) => <div key={t.dow} className="flex justify-between text-sm"><span>{t.dow}</span><span>{t.count} movimientos</span></div>) : <p className="text-sm text-muted-foreground">Sin evolución para el período.</p>}</CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Insights automáticos</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {comparison < 0 && <p>• Las ventas cayeron contra el período anterior ({comparison.toFixed(1)}%).</p>}
              {concentrationPct >= 60 && <p>• Hay concentración alta: el top 3 aporta {concentrationPct.toFixed(1)}% de ingresos.</p>}
              {lowProducts.length > 0 && <p>• {lowProducts.length} productos muestran baja rotación en el período.</p>}
              {comparison >= 0 && concentrationPct < 60 && lowProducts.length === 0 && <p>Sin alertas relevantes para este período.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
