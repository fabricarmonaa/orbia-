import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

type OverviewData = {
  period: { from: string; to: string; mode: string };
  summary: {
    salesTotal: number;
    salesCount: number;
    ordersCount: number;
    avgTicket: number;
    previousTotal: number;
    previousCount: number;
    growthPct: number | null;
    concentrationPct: number;
  };
  topProducts: Array<{ name: string; qtySold: number; revenue: number }>;
  lowProducts: Array<{ name: string; qtySold: number; revenue: number }>;
  categoryRevenue: Array<{ category: string; revenue: number }>;
  orderStatuses: Array<{ statusCode: string; count: number }>;
  movementByHour: Array<{ hour: number; count: number }>;
  movementByWeekday: Array<{ dow: string; count: number }>;
};

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("month");
  const [from, setFrom] = useState(fmt(monthStart));
  const [to, setTo] = useState(fmt(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewData | null>(null);

  const formattedGrowth = useMemo(() => {
    const value = data?.summary?.growthPct;
    if (value == null || Number.isNaN(value)) return "N/A";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  }, [data]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ period, ...(period === "custom" ? { from, to } : {}) }).toString();
      const res = await apiRequest("GET", `/api/reports/overview?${qs}`);
      const json = await res.json();
      setData(json.data || null);
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar reportes");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [period]);

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-muted-foreground">Visión comercial para decisiones de ventas y rentabilidad.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant={period === "today" ? "default" : "outline"} onClick={() => setPeriod("today")}>Hoy</Button>
          <Button variant={period === "week" ? "default" : "outline"} onClick={() => setPeriod("week")}>Semana</Button>
          <Button variant={period === "month" ? "default" : "outline"} onClick={() => setPeriod("month")}>Mes</Button>
          <Button variant={period === "custom" ? "default" : "outline"} onClick={() => setPeriod("custom")}>Rango</Button>
        </div>
      </div>

      {period === "custom" && (
        <Card>
          <CardContent className="pt-6 flex gap-2 flex-wrap items-end">
            <div>
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button onClick={() => void load()}>Aplicar</Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error en reportes</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !data ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Sin datos para el período seleccionado.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardHeader><CardTitle className="text-sm">Ventas totales</CardTitle></CardHeader><CardContent className="text-2xl font-bold">${summary?.salesTotal.toLocaleString("es-AR")}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Ventas / pedidos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{summary?.salesCount}</p><p className="text-xs text-muted-foreground">Pedidos: {summary?.ordersCount}</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Ticket promedio</CardTitle></CardHeader><CardContent className="text-2xl font-bold">${summary?.avgTicket.toLocaleString("es-AR")}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Crecimiento vs período previo</CardTitle></CardHeader><CardContent><p className={`text-2xl font-bold ${(summary?.growthPct || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formattedGrowth}</p><p className="text-xs text-muted-foreground">Concentración Top 3: {summary?.concentrationPct.toFixed(1)}%</p></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Productos más vendidos</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.topProducts.length === 0 ? <p className="text-sm text-muted-foreground">Sin ventas de productos.</p> : data.topProducts.map((p, idx) => (
                  <div key={`${p.name}-${idx}`} className="flex items-center justify-between border rounded p-2">
                    <div><p className="font-medium text-sm">{p.name}</p><p className="text-xs text-muted-foreground">{p.qtySold} uds.</p></div>
                    <Badge>${p.revenue.toLocaleString("es-AR")}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Productos de menor rotación</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.lowProducts.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos.</p> : data.lowProducts.map((p, idx) => (
                  <div key={`${p.name}-${idx}`} className="flex items-center justify-between border rounded p-2">
                    <div><p className="font-medium text-sm">{p.name}</p><p className="text-xs text-muted-foreground">{p.qtySold} uds.</p></div>
                    <Badge variant="outline">${p.revenue.toLocaleString("es-AR")}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Ingresos por categoría</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.categoryRevenue} dataKey="revenue" nameKey="category" outerRadius={110} label>
                      {data.categoryRevenue.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString("es-AR")}`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Estado de pedidos</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.orderStatuses.length === 0 ? <p className="text-sm text-muted-foreground">Sin pedidos en el período.</p> : data.orderStatuses.map((s) => (
                  <div key={s.statusCode} className="flex items-center justify-between border rounded p-2">
                    <span className="font-medium text-sm">{s.statusCode}</span>
                    <Badge>{s.count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Movimiento por hora</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.movementByHour}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Movimiento por día</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.movementByWeekday}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dow" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
