import { useEffect, useMemo, useState } from "react";
import { apiRequest, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, Wallet, Package, TrendingUp, TrendingDown, CalendarDays, Clock, NotebookPen, AlertCircle } from "lucide-react";

type DashboardAnalytics = {
  avgTicket: number;
  avgTicketVariation: number;
  collectionEfficiency: { paid: number; unpaid: number };
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
  agenda?: { today: Array<any>; upcoming: Array<any> };
  notes?: { active: Array<any> };
};

const ZERO_SUMMARY: DashboardSummary = {
  orders: { openCount: 0, totalCount: 0, pendingCount: 0, inProgressCount: 0 },
  cash: { monthIncome: 0, monthExpense: 0, monthFixedExpense: 0, monthVariableExpense: 0, monthResult: 0 },
  products: { count: 0 },
  agenda: { today: [], upcoming: [] },
  notes: { active: [] },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary>(ZERO_SUMMARY);
  const [analytics, setAnalytics] = useState<DashboardAnalytics>({ avgTicket: 0, avgTicketVariation: 0, collectionEfficiency: { paid: 0, unpaid: 0 }, staleProducts60d: 0, topProductMonth: null });

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
            avgTicketVariation: Number(analyticsJson.data.avgTicketVariation || 0),
            collectionEfficiency: {
              paid: Number(analyticsJson.data.collectionEfficiency?.paid || 0),
              unpaid: Number(analyticsJson.data.collectionEfficiency?.unpaid || 0),
            },
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
            agenda: { today: json.agenda?.today || [], upcoming: json.agenda?.upcoming || [] },
            notes: { active: json.notes?.active || [] },
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
        title: "Ingresos del Mes",
        value: `$${summary.cash.monthIncome.toLocaleString("es-AR")}`,
        subtitle: "Mes actual",
        icon: Wallet,
      },
      {
        title: "Ticket Promedio",
        value: `$${Math.round(analytics.avgTicket).toLocaleString("es-AR")}`,
        subtitle: `${analytics.avgTicketVariation > 0 ? "+" : ""}${analytics.avgTicketVariation}% quincena actual`,
        icon: TrendingUp,
        color: analytics.avgTicketVariation >= 0 ? "text-emerald-500" : "text-amber-500",
        tooltip: "Gasto promedio por cada pedido en los últimos 15 días",
      },
      {
        title: "Eficiencia de Cobro",
        value: `${analytics.collectionEfficiency.paid > 0 || analytics.collectionEfficiency.unpaid > 0 ? Math.round((analytics.collectionEfficiency.paid / (analytics.collectionEfficiency.paid + analytics.collectionEfficiency.unpaid)) * 100) : 0}%`,
        subtitle: `Pagado: $${analytics.collectionEfficiency.paid.toLocaleString("es-AR")} | Impago: $${analytics.collectionEfficiency.unpaid.toLocaleString("es-AR")}`,
        icon: Wallet,
        color: "text-blue-500",
        tooltip: "Porcentaje de dinero realmente cobrado de todos tus pedidos activos a la fecha",
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agenda Hoy */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-3 border-b bg-muted/10">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              Hoy en la Agenda
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(summary.agenda?.today || []).length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <CalendarDays className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Sin eventos para hoy</p>
              </div>
            ) : (
              <div className="divide-y">
                {(summary.agenda?.today || []).slice(0, 5).map((ev: any) => (
                  <div key={`today-${ev.id}`} className="p-4 hover:bg-muted/30 transition-colors flex items-start gap-3">
                    <div className="w-1.5 h-full self-stretch rounded-full bg-primary/20 shrink-0"></div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-semibold text-sm truncate text-foreground">{ev.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{ev.allDay ? "Todo el día" : new Date(ev.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="font-medium text-[10px] uppercase px-1.5 py-0.5 rounded-sm bg-muted/60 text-muted-foreground ml-auto">{ev.eventType}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Próximos Recordatorios */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-3 border-b bg-muted/10">
            <CardTitle className="text-base flex items-center gap-2 text-orange-600">
              <Clock className="w-5 h-5" />
              Próximos Recordatorios
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(summary.agenda?.upcoming || []).length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <Clock className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Sin próximos eventos</p>
              </div>
            ) : (
              <div className="divide-y">
                {(summary.agenda?.upcoming || []).slice(0, 5).map((ev: any) => (
                  <div key={`up-${ev.id}`} className="p-4 hover:bg-muted/30 transition-colors flex items-start gap-3">
                    <div className="w-10 h-10 rounded-md bg-orange-50 border border-orange-100 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-orange-600 uppercase leading-none">{new Date(ev.startsAt).toLocaleString("es-AR", { month: "short" })}</span>
                      <span className="text-sm font-bold text-orange-800 leading-none mt-0.5">{new Date(ev.startsAt).getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate text-foreground">{ev.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(ev.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notas Activas */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-3 border-b bg-muted/10">
            <CardTitle className="text-base flex items-center gap-2 text-indigo-600">
              <NotebookPen className="w-5 h-5" />
              Notas Activas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(summary.notes?.active || []).length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <NotebookPen className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">Sin notas activas</p>
              </div>
            ) : (
              <div className="divide-y">
                {(summary.notes?.active || []).slice(0, 5).map((n: any) => {
                  const isOverdue = n.remind_at && new Date(n.remind_at) < new Date();
                  return (
                    <div key={`note-${n.id}`} className={`p-4 hover:bg-muted/30 transition-colors ${isOverdue ? "bg-red-50/30" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm truncate text-foreground">{n.title}</p>
                        {isOverdue && <div title="Vencida" className="shrink-0"><AlertCircle className="w-4 h-4 text-red-500" /></div>}
                      </div>
                      {n.remind_at && (
                        <p className={`text-xs mt-1.5 flex items-center gap-1 font-medium ${isOverdue ? "text-red-600" : "text-indigo-600"}`}>
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(n.remind_at).toLocaleString("es-AR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
