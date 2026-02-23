import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const today = new Date();
const weekAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsDashboardPage() {
  const [from, setFrom] = useState(fmt(weekAgo));
  const [to, setTo] = useState(fmt(today));
  const [data, setData] = useState<any>(null);

  async function load() {
    const qs = new URLSearchParams({ from, to }).toString();
    const res = await apiRequest("GET", `/api/reports/kpis?${qs}`);
    setData(await res.json());
  }

  useEffect(() => {
    const saved = localStorage.getItem("reports:filters");
    if (saved) {
      const p = JSON.parse(saved);
      setFrom(p.from || fmt(weekAgo));
      setTo(p.to || fmt(today));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("reports:filters", JSON.stringify({ from, to }));
    load().catch(() => setData(null));
  }, [from, to]);

  const k = data?.kpis || {};
  const series = useMemo(() => data?.series?.daily || [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div>
          <label className="text-xs">Desde</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs">Hasta</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button onClick={() => load()}>Actualizar</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><CardHeader><CardTitle>Ventas netas</CardTitle></CardHeader><CardContent>${Number(k.netSales || 0).toLocaleString("es-AR")}</CardContent></Card>
        <Card><CardHeader><CardTitle>Ventas</CardTitle></CardHeader><CardContent>{Number(k.salesCount || 0)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Ticket promedio</CardTitle></CardHeader><CardContent>${Number(k.avgTicket || 0).toLocaleString("es-AR")}</CardContent></Card>
        <Card><CardHeader><CardTitle>Bajo stock</CardTitle></CardHeader><CardContent>{Number(k.lowStockCount || 0)}</CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Serie diaria</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="netSales" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
