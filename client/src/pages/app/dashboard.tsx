import { useEffect, useMemo, useState } from "react";
import { apiRequest, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DashboardData = {
  salesToday: number;
  salesMonth: number;
  expensesMonth: number;
  marginMonth: number;
  incomeMonth: number;
  orders: {
    completed: number;
    pending: number;
  };
  branches: Array<{ branchId: number; branchName: string; revenue: number }>;
};

type TopProduct = { productId: number; productName: string; totalSold: number; totalRevenue: number };
type TopCustomer = { customerId: number; customerName: string; totalOrders: number; totalSpent: number };
type TopTechnician = { technicianName: string; completedOrders: number; totalRevenue: number };
type SalesPoint = { date: string; totalRevenue: number };

const ZERO: DashboardData = {
  salesToday: 0,
  salesMonth: 0,
  expensesMonth: 0,
  marginMonth: 0,
  incomeMonth: 0,
  orders: { completed: 0, pending: 0 },
  branches: [],
};

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardData>(ZERO);
  const [salesSeries, setSalesSeries] = useState<SalesPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [topTechnicians, setTopTechnicians] = useState<TopTechnician[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [dashboardRes, salesRes, productsRes, customersRes, techRes] = await Promise.all([
          apiRequest("GET", "/api/analytics/dashboard"),
          apiRequest("GET", "/api/analytics/sales?range=30d"),
          apiRequest("GET", "/api/analytics/products"),
          apiRequest("GET", "/api/analytics/customers"),
          apiRequest("GET", "/api/analytics/technicians"),
        ]);

        const dashboardJson = await dashboardRes.json().catch(() => ({}));
        const salesJson = await salesRes.json().catch(() => ({}));
        const productsJson = await productsRes.json().catch(() => ({}));
        const customersJson = await customersRes.json().catch(() => ({}));
        const techJson = await techRes.json().catch(() => ({}));

        if (dashboardRes.ok && dashboardJson?.data) setSummary({ ...ZERO, ...dashboardJson.data });
        if (salesRes.ok && Array.isArray(salesJson?.data)) setSalesSeries(salesJson.data);
        if (productsRes.ok && Array.isArray(productsJson?.data)) setTopProducts(productsJson.data);
        if (customersRes.ok && Array.isArray(customersJson?.data)) setTopCustomers(customersJson.data);
        if (techRes.ok && Array.isArray(techJson?.data)) setTopTechnicians(techJson.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = useMemo(
    () => [
      { title: "Ventas hoy", value: formatMoney(summary.salesToday), icon: TrendingUp },
      { title: "Ventas del mes", value: formatMoney(summary.salesMonth), icon: Wallet },
      { title: "Egresos del mes", value: formatMoney(summary.expensesMonth), icon: TrendingDown },
      { title: "Margen del mes", value: formatMoney(summary.marginMonth), icon: summary.marginMonth >= 0 ? TrendingUp : TrendingDown },
    ],
    [summary]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">Inicio</h1>
        <p className="text-muted-foreground">Bienvenido, {user?.fullName}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-14 w-full" /></CardContent></Card>
            ))
          : cards.map((card) => (
              <Card key={card.title}>
                <CardContent className="pt-6 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-2xl font-bold">{card.value}</p>
                  </div>
                  <div className="p-3 rounded-md bg-primary/10"><card.icon className="w-5 h-5 text-primary" /></div>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Ventas últimos 30 días</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesSeries}>
                  <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tickFormatter={(v) => `$${Number(v).toLocaleString("es-AR")}`} />
                  <Tooltip formatter={(value: any) => [formatMoney(Number(value || 0)), "Ventas"]} />
                  <Line type="monotone" dataKey="totalRevenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Productos más vendidos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(topProducts.length ? topProducts : []).slice(0, 5).map((row) => (
              <div key={row.productId} className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <p className="font-medium text-sm">{row.productName}</p>
                  <p className="text-xs text-muted-foreground">{Number(row.totalSold).toLocaleString("es-AR")} unidades</p>
                </div>
                <p className="font-semibold text-sm">{formatMoney(row.totalRevenue)}</p>
              </div>
            ))}
            {!loading && topProducts.length === 0 && <p className="text-sm text-muted-foreground">Sin datos todavía.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Clientes destacados</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(topCustomers.length ? topCustomers : []).slice(0, 5).map((row) => (
              <div key={row.customerId} className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <p className="font-medium text-sm">{row.customerName}</p>
                  <p className="text-xs text-muted-foreground">{Number(row.totalOrders).toLocaleString("es-AR")} compras</p>
                </div>
                <p className="font-semibold text-sm">{formatMoney(row.totalSpent)}</p>
              </div>
            ))}
            {!loading && topCustomers.length === 0 && <p className="text-sm text-muted-foreground">Sin datos todavía.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Técnicos destacados</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topTechnicians.slice(0, 5).map((row) => (
              <div key={row.technicianName} className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <p className="font-medium text-sm">{row.technicianName}</p>
                  <p className="text-xs text-muted-foreground">{row.completedOrders} completados</p>
                </div>
                <p className="font-semibold text-sm">{formatMoney(row.totalRevenue)}</p>
              </div>
            ))}
            {!loading && topTechnicians.length === 0 && <p className="text-sm text-muted-foreground">No hay técnicos cargados para mostrar.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ventas por sucursal</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {summary.branches.slice(0, 6).map((row) => (
              <div key={row.branchId} className="flex items-center justify-between rounded-md border p-2">
                <p className="font-medium text-sm">{row.branchName}</p>
                <p className="font-semibold text-sm">{formatMoney(row.revenue)}</p>
              </div>
            ))}
            {!loading && summary.branches.length === 0 && <p className="text-sm text-muted-foreground">Sin sucursales para mostrar.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Pedidos: completados vs pendientes</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Completados</p>
            <p className="text-xl font-semibold">{summary.orders.completed.toLocaleString("es-AR")}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Pendientes</p>
            <p className="text-xl font-semibold">{summary.orders.pending.toLocaleString("es-AR")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
