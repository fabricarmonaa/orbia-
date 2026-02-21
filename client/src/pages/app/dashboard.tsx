import { useState, useEffect } from "react";
import { apiRequest, useAuth } from "@/lib/auth";
import { usePlan } from "@/lib/plan";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  Wallet,
  Package,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface DashboardRecentOrder { id:number; orderNumber?:number; customerName?:string; createdAt?:string; }
interface DashboardActivity { ts:string; type:string; action:string; reference:string; }

interface DashboardStats {
  totalOrders: number;
  openOrders: number;
  todayIncome: number;
  todayExpenses: number;
  totalProducts: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { plan } = usePlan();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState<DashboardRecentOrder[]>([]);
  const [inProgressOrders, setInProgressOrders] = useState<DashboardRecentOrder[]>([]);
  const [activities, setActivities] = useState<DashboardActivity[]>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const [res, recentRes, activityRes] = await Promise.all([
        apiRequest("GET", "/api/dashboard/stats"),
        apiRequest("GET", "/api/dashboard/recent-orders?limit=8"),
        apiRequest("GET", "/api/dashboard/activity?limit=12"),
      ]);
      const data = await res.json();
      const recentData = await recentRes.json();
      const activityData = await activityRes.json();
      setStats(data.data);
      setPendingOrders(recentData.pending || []);
      setInProgressOrders(recentData.inProgress || []);
      setActivities(activityData.items || []);
    } catch {
      setStats({
        totalOrders: 0,
        openOrders: 0,
        todayIncome: 0,
        todayExpenses: 0,
        totalProducts: 0,
        monthlyIncome: 0,
        monthlyExpenses: 0,
      });
    } finally {
      setLoading(false);
    }
  }

  const profit = (stats?.monthlyIncome || 0) - (stats?.monthlyExpenses || 0);
  const isEconomic = (plan?.planCode || "").toUpperCase() === "ECONOMICO";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Bienvenido, {user?.fullName}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Pedidos Abiertos</p>
                    <p className="text-2xl font-bold" data-testid="text-open-orders">
                      {stats?.openOrders || 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      de {stats?.totalOrders || 0} totales
                    </p>
                  </div>
                  <div className="p-3 rounded-md bg-primary/10">
                    <ClipboardList className="w-5 h-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {!isEconomic && (
              <>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Ingresos del Mes</p>
                        <p className="text-2xl font-bold" data-testid="text-monthly-income">
                          ${(stats?.monthlyIncome || 0).toLocaleString("es-AR")}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <ArrowUpRight className="w-3 h-3 text-chart-2" />
                          <p className="text-xs text-chart-2">Hoy: ${(stats?.todayIncome || 0).toLocaleString("es-AR")}</p>
                        </div>
                      </div>
                      <div className="p-3 rounded-md bg-chart-2/10">
                        <Wallet className="w-5 h-5 text-chart-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Egresos del Mes</p>
                        <p className="text-2xl font-bold" data-testid="text-monthly-expenses">
                          ${(stats?.monthlyExpenses || 0).toLocaleString("es-AR")}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <ArrowDownRight className="w-3 h-3 text-destructive" />
                          <p className="text-xs text-destructive">Hoy: ${(stats?.todayExpenses || 0).toLocaleString("es-AR")}</p>
                        </div>
                      </div>
                      <div className="p-3 rounded-md bg-destructive/10">
                        <Wallet className="w-5 h-5 text-destructive" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Productos</p>
                    <p className="text-2xl font-bold" data-testid="text-total-products">
                      {stats?.totalProducts || 0}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Resultado: ${profit.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <div className="p-3 rounded-md bg-chart-4/10">
                    <Package className="w-5 h-5 text-chart-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!isEconomic ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <div>
                <h3 className="font-semibold">Resumen Mensual</h3>
                <p className="text-sm text-muted-foreground">Balance del mes actual</p>
              </div>
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Ingresos</span>
                  <span className="text-sm font-medium text-chart-2">
                    +${(stats?.monthlyIncome || 0).toLocaleString("es-AR")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Egresos</span>
                  <span className="text-sm font-medium text-destructive">
                    -${(stats?.monthlyExpenses || 0).toLocaleString("es-AR")}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Resultado</span>
                    <span className={`text-sm font-bold ${profit >= 0 ? "text-chart-2" : "text-destructive"}`}>
                      ${profit.toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              El resumen mensual está disponible a partir del plan Profesional.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <div>
              <h3 className="font-semibold">Actividad Reciente</h3>
              <p className="text-sm text-muted-foreground">Últimos pedidos</p>
            </div>
            <ClipboardList className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Pendientes</p>
                  {(pendingOrders.length ? pendingOrders : []).map((o)=> <p key={`p-${o.id}`} className="text-sm">#{o.orderNumber || o.id} · {o.customerName || "Sin cliente"}</p>)}
                  {!pendingOrders.length && <p className="text-sm text-muted-foreground">Sin pendientes</p>}
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">En proceso</p>
                  {(inProgressOrders.length ? inProgressOrders : []).map((o)=> <p key={`i-${o.id}`} className="text-sm">#{o.orderNumber || o.id} · {o.customerName || "Sin cliente"}</p>)}
                  {!inProgressOrders.length && <p className="text-sm text-muted-foreground">Sin pedidos en proceso</p>}
                </div>
                <div className="border-t pt-2">
                  <p className="text-xs uppercase text-muted-foreground">Actividad reciente</p>
                  {(activities.slice(0,5) || []).map((a,idx)=> <p key={idx} className="text-sm">{new Date(a.ts).toLocaleString()} · {a.type} · {a.reference}</p>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
