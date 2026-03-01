import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchPlan, clearPlanCache } from "@/lib/plan";
import { useLocation, Route, Switch } from "wouter";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { AlertTriangle, X } from "lucide-react";
import Dashboard from "./dashboard";
import OrdersPage from "./orders";
import CashPage from "./cash";
import ProductsPage from "./products";
import PosPage from "./pos";
import SalesHistoryPage from "./sales-history";
import CashiersPage from "./cashiers";
import BranchesPage from "./branches";
import BranchDetailPage from "./branch-detail";
import DeliveryPage from "./delivery";
import SettingsPage from "./settings";
import SettingsOrdersPage from "./settings-orders";
import MessagingSettingsPage from "./messaging";
import PurchasesPage from "./purchases";
import CustomersPage from "./customers";
import PrintTestPage from "./print-test";
import OrderPrintPage from "./order-print";
import SalePrintPage from "./sale-print";
import { GlobalVoiceFab } from "@/components/global-voice-fab";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function SubscriptionBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !user) return null;

  const warning = (user as any).subscriptionWarning as string | undefined;
  if (!warning) return null;

  const isGrace = warning.toLowerCase().includes("gracia") || warning.toLowerCase().includes("bloqueada");
  const bgClass = isGrace
    ? "bg-destructive/10 border-destructive/30 text-destructive"
    : "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400";

  return (
    <div className={`flex items-center gap-3 px-4 py-2 border-b ${bgClass}`} data-testid="banner-subscription-warning">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <p className="text-sm flex-1">{warning}</p>
      <button onClick={() => setDismissed(true)} className="p-0.5 rounded" data-testid="button-dismiss-warning">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function AppLayout() {
  const { isAuthenticated, user } = useAuth();
  const [location, setLocation] = useLocation();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const key = `orbia:onboarding:dismissed:${user.id}`;
    const dismissed = localStorage.getItem(key) === "1";
    const ownerLike = ["admin", "owner"].includes(String((user as any).role || "").toLowerCase());
    if (ownerLike && !dismissed) setOnboardingOpen(true);
  }, [user?.id]);

  const dismissOnboarding = () => {
    if (user?.id) localStorage.setItem(`orbia:onboarding:dismissed:${user.id}`, "1");
    setOnboardingOpen(false);
  };

  useEffect(() => {
    if (!isAuthenticated || user?.isSuperAdmin) {
      clearPlanCache();
      setLocation("/login");
    } else {
      fetchPlan();
    }
  }, [isAuthenticated, user]);

  if (!isAuthenticated || user?.isSuperAdmin) return null;

  const isPrintRoute = location.startsWith("/app/print/");

  if (isPrintRoute) {
    return (
      <main className="min-h-screen bg-white">
        <Switch>
          {user?.role !== "CASHIER" && <Route path="/app/print/order/:orderId" component={OrderPrintPage} />}
          <Route path="/app/print/sale/:saleId" component={SalePrintPage} />
        </Switch>
      </main>
    );
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-card sticky top-0 z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <SubscriptionBanner />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <Switch>
              {user?.role !== "CASHIER" && <Route path="/app/orders" component={OrdersPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/cash" component={CashPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/products" component={ProductsPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/purchases" component={PurchasesPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/customers" component={CustomersPage} />}
              <Route path="/app/pos" component={PosPage} />
              <Route path="/app/sales" component={SalesHistoryPage} />
              {user?.role !== "CASHIER" && <Route path="/app/cashiers" component={CashiersPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/branches/:branchId" component={BranchDetailPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/branches" component={BranchesPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/delivery" component={DeliveryPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/settings/orders" component={SettingsOrdersPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/settings" component={SettingsPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/print-test" component={PrintTestPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/print/order/:orderId" component={OrderPrintPage} />}
              <Route path="/app/print/sale/:saleId" component={SalePrintPage} />
                            {user?.role !== "CASHIER" && <Route path="/app/messaging" component={MessagingSettingsPage} />}
              {user?.role !== "CASHIER" && <Route path="/app/reports/dashboard">{() => { window.location.replace('/app/cash?tab=kpis'); return null; }}</Route>}
              {user?.role !== "CASHIER" && <Route path="/app/reports/sales">{() => { window.location.replace('/app/cash?tab=kpis'); return null; }}</Route>}
              {user?.role !== "CASHIER" && <Route path="/app/reports/products">{() => { window.location.replace('/app/cash?tab=kpis'); return null; }}</Route>}
              {user?.role !== "CASHIER" && <Route path="/app/reports/customers">{() => { window.location.replace('/app/cash?tab=kpis'); return null; }}</Route>}
              {user?.role !== "CASHIER" && <Route path="/app/reports/cash">{() => { window.location.replace('/app/cash?tab=movements'); return null; }}</Route>}
                                                                                    {user?.role !== "CASHIER" && <Route path="/app" component={Dashboard} />}
              {user?.role === "CASHIER" && <Route path="/app" component={PosPage} />}
            </Switch>
          </main>
          <Dialog open={onboardingOpen} onOpenChange={setOnboardingOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bienvenido a Orbia</DialogTitle>
                <DialogDescription>Completá estos pasos para activar tu negocio rápido.</DialogDescription>
              </DialogHeader>
              <ol className="list-decimal pl-5 text-sm space-y-2">
                <li>Completar perfil del negocio (ajustes).</li>
                <li>Confirmar tu primera sucursal.</li>
                <li>Cargar tu primer producto.</li>
                <li>Ir al POS y registrar una venta demo.</li>
              </ol>
              <DialogFooter>
                <Button variant="outline" onClick={dismissOnboarding}>Saltar</Button>
                <Button onClick={() => { setOnboardingOpen(false); setLocation("/app/settings"); }}>Empezar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <GlobalVoiceFab />
        </div>
      </div>
    </SidebarProvider>
  );
}
