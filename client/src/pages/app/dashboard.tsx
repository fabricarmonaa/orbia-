import { useEffect, useMemo, useState } from "react";
import { apiRequest, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Wallet, Package, TrendingUp, TrendingDown } from "lucide-react";

type DashboardAnalytics = {
  avgTicket: number;
  staleProducts60d: number;
  topProductMonth: { name: string; units: number } | null;
};

type DashboardSummary = {
  orders: {
    openCount: number;
    totalCount: number;
    pendingCount: number;
    inProgressCount: number;
  };
  cash: {
    monthIncome: number;
    monthExpense: number;
    monthFixedExpense: number;
    monthVariableExpense: number;
    monthResult: number;
  };
  products: {
    count: number;
  };
};

const ZERO_SUMMARY: DashboardSummary = {
  orders: { openCount: 0, totalCount: 0, pendingCount: 0, inProgressCount: 0 },
  cash: { monthIncome: 0, monthExpense: 0, monthFixedExpense: 0, monthVariableExpense: 0, monthResult: 0 },
  products: { count: 0 },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary>(ZERO_SUMMARY);
  const [analytics, setAnalytics] = useState<DashboardAnalytics>({ avgTicket: 0, staleProducts60d: 0, topProductMonth: null });

  useEffect(() => {
    (async () => {
      try {
        const [res, analyticsRes] = await Promise.all([
          apiRequest("GET", "/api/dashboard/summary"),
          apiRequest("GET", "/api/analytics/dashboard"),
        ]);
        const json = await res.json();
        const analyticsJson = await analyticsRes.json().catch(() => ({} as any));
        if (analyticsRes.ok && analyticsJson?.data) {
          setAnalytics({
            avgTicket: Number(analyticsJson.data.avgTicket || 0),
            staleProducts60d: Number(analyticsJson.data.staleProducts60d || 0),
            topProductMonth: analyticsJson.data.topProductMonth || null,
          });
        }
        if (res.ok && json) {
          setSummary({
            orders: {
              openCount: Number(json.orders?.openCount || 0),
              totalCount: Number(json.orders?.totalCount || 0),
              pendingCount: Number(json.orders?.pendingCount || 0),
              inProgressCount: Number(json.orders?.inProgressCount || 0),
            },
            cash: {
              monthIncome: Number(json.cash?.monthIncome || 0),
              monthExpense: Number(json.cash?.monthExpense || 0),
              monthFixedExpense: Number(json.cash?.monthFixedExpense || 0),
              monthVariableExpense: Number(json.cash?.monthVariableExpense || 0),
              monthResult: Number(json.cash?.monthResult || 0),
            },
            products: { count: Number(json.products?.count || 0) },
          });
        } else {
          setSummary(ZERO_SUMMARY);
        }
      } catch {
        setSummary(ZERO_SUMMARY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = useMemo(
    () => [
      {
        title: "Pedidos Totales",
        value: summary.orders.totalCount.toLocaleString("es-AR"),
        subtitle: `${summary.orders.openCount.toLocaleString("es-AR")} abiertos`,
        icon: ClipboardList,
      },
      {
        title: "Ingresos del Mes",
        value: `$${summary.cash.monthIncome.toLocaleString("es-AR")}`,
        subtitle: "Mes actual",
        icon: Wallet,
      },
      {
        title: "Ticket promedio",
        value: `$${analytics.avgTicket.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`,
        subtitle: "Promedio por venta",
        icon: TrendingUp,
      },
      {
        title: "Sin ventas 60 días",
        value: analytics.staleProducts60d.toLocaleString("es-AR"),
        subtitle: "Productos para revisar",
        icon: TrendingDown,
      },
      {
        title: "Top producto del mes",
        value: analytics.topProductMonth?.name || "Sin datos",
        subtitle: analytics.topProductMonth ? `${analytics.topProductMonth.units} unidades` : "Mes actual",
        icon: Package,
      },
      {
        title: "Productos",
        value: summary.products.count.toLocaleString("es-AR"),
        subtitle: "Catálogo activo",
        icon: Package,
      },
    ],
    [summary, analytics]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground">Bienvenido, {user?.fullName}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading
          ? [1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent>
            </Card>
          ))
          : cards.map((card) => (
            <Card key={card.title}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-2xl font-bold">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                  </div>
                  <div className="p-3 rounded-md bg-primary/10"><card.icon className="w-5 h-5 text-primary" /></div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Pedidos Abiertos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="text-4xl font-bold">{summary.orders.openCount.toLocaleString("es-AR")}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Pendientes</p>
                    <p className="text-xl font-semibold">{summary.orders.pendingCount.toLocaleString("es-AR")}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">En proceso</p>
                    <p className="text-xl font-semibold">{summary.orders.inProgressCount.toLocaleString("es-AR")}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Resumen Mensual</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm text-muted-foreground">Ingresos</span>
                  <span className="font-semibold inline-flex items-center gap-1 text-emerald-600">
                    <TrendingUp className="w-4 h-4" />
                    ${summary.cash.monthIncome.toLocaleString("es-AR")}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Egresos Totales</span>
                    <span className="font-semibold inline-flex items-center gap-1 text-rose-600">
                      <TrendingDown className="w-4 h-4" />
                      ${summary.cash.monthExpense.toLocaleString("es-AR")}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Fijos: ${summary.cash.monthFixedExpense.toLocaleString("es-AR")}</span>
                    <span>Variables: ${summary.cash.monthVariableExpense.toLocaleString("es-AR")}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 bg-primary/5">
                  <span className="text-sm font-medium">Resultado</span>
                  <span className={`font-bold inline-flex items-center gap-1 ${summary.cash.monthResult >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {summary.cash.monthResult >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    ${summary.cash.monthResult.toLocaleString("es-AR")}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
