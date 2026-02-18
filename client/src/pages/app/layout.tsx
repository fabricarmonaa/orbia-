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
import BranchesPage from "./branches";
import BranchDetailPage from "./branch-detail";
import DeliveryPage from "./delivery";
import SettingsPage from "./settings";

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
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated || user?.isSuperAdmin) {
      clearPlanCache();
      setLocation("/login");
    } else {
      fetchPlan();
    }
  }, [isAuthenticated, user]);

  if (!isAuthenticated || user?.isSuperAdmin) return null;

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
              <Route path="/app/orders" component={OrdersPage} />
              <Route path="/app/cash" component={CashPage} />
              <Route path="/app/products" component={ProductsPage} />
              <Route path="/app/branches/:branchId" component={BranchDetailPage} />
              <Route path="/app/branches" component={BranchesPage} />
              <Route path="/app/delivery" component={DeliveryPage} />
              <Route path="/app/settings" component={SettingsPage} />
              <Route path="/app" component={Dashboard} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
