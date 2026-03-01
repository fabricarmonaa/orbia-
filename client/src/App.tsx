import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { BrandingProvider } from "@/context/BrandingContext";
import NotFound from "@/pages/not-found";
import SuperLogin from "@/pages/super-login";
import TenantLogin from "@/pages/tenant-login";
import OwnerDashboard from "@/pages/owner/index";
import AppLayout from "@/pages/app/layout";
import PublicTracking from "@/pages/public-tracking";
import DeliveryLogin from "@/pages/delivery-login";
import DeliveryPanel from "@/pages/delivery-panel";
import PublicTosPage from "@/pages/public-tos";
import { SessionLifecycleManager } from "@/components/session-lifecycle-manager";
import { PwaRuntime } from "@/components/pwa-runtime";
import { AuthGuard } from "@/components/auth-guard";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/login" />
      </Route>
      <Route path="/login" component={TenantLogin} />
      <Route path="/owner/login" component={SuperLogin} />
      <Route path="/owner" component={OwnerDashboard} />
      <Route path="/super" component={OwnerDashboard} />
      <Route path="/app/*?" component={AppLayout} />
      <Route path="/delivery/login" component={DeliveryLogin} />
      <Route path="/delivery/panel" component={DeliveryPanel} />
      <Route path="/tracking/:id" component={PublicTracking} />
      <Route path="/t/:slug/tos" component={PublicTosPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <BrandingProvider>
            <Toaster />
            <SessionLifecycleManager />
            <PwaRuntime />
            <AuthGuard />
            <Router />
          </BrandingProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
