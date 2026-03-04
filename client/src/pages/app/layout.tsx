import { useEffect, useMemo, useState } from "react";
import { apiRequest, getActiveBranchId, setActiveBranchId, useAuth } from "@/lib/auth";
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
import AuditPage from "./audit";
import PurchasesPage from "./purchases";
import CustomersPage from "./customers";
import PrintTestPage from "./print-test";
import OrderPrintPage from "./order-print";
import SalePrintPage from "./sale-print";
import { GlobalVoiceFab } from "@/components/global-voice-fab";
import Joyride, { Step, CallBackProps, STATUS } from "react-joyride";
import { Button } from "@/components/ui/button";
import { UI_TEXTS_ES_AR } from "@/constants/ui-texts-es-ar";
import { useToast } from "@/hooks/use-toast";

type BranchOption = { id: number; name: string };

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
  const [runTour, setRunTour] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<number | null>(getActiveBranchId());
  const { toast } = useToast();

  const fallbackTourStep: Step = useMemo(
    () => ({
      target: "body",
      placement: "center",
      content: (
        <div className="text-left">
          <h3 className="font-bold text-lg mb-2">Recorrido finalizado</h3>
          <p className="text-sm text-muted-foreground">
            Este paso no está disponible en tu pantalla actual, así que finalizamos el recorrido para que puedas seguir usando Orbia sin interrupciones.
          </p>
        </div>
      ),
      disableBeacon: true,
    }),
    []
  );

  const tourSteps: Step[] = useMemo(() => [
    {
      target: "body",
      placement: "center",
      content: (
        <div className="text-left">
          <h3 className="font-bold text-lg mb-2">¡Bienvenido a Orbia! 👋</h3>
          <p className="text-sm text-muted-foreground">
            Este recorrido rápido te va a mostrar todo lo que podés hacer desde el panel. Vamos paso a paso así arrancás con todo configurado.
          </p>
        </div>
      ),
      disableBeacon: true,
    },
    {
      target: ".joyride-sidebar",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">Menú Principal</h3>
          <p className="text-sm text-muted-foreground">Desde aquí accedés a todos los módulos: pedidos, caja, productos, clientes, compras y más. Todo en un solo lugar.</p>
        </div>
      ),
      placement: "right",
    },
    {
      target: "[data-testid='nav-configuracion']",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">⚙️ Configuración</h3>
          <p className="text-sm text-muted-foreground">Lo primero que tenés que hacer es configurar tu negocio. Aquí encontrás:</p>
          <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc pl-4">
            <li><strong>Branding</strong>: logo, nombre, slogan y colores de tu marca</li>
            <li><strong>Precios</strong>: margen automático vs precio manual</li>
            <li><strong>Pedidos</strong>: estados personalizados, presets y opciones de entrega</li>
            <li><strong>Integraciones</strong>: WhatsApp y seguimiento de pedidos</li>
          </ul>
        </div>
      ),
      placement: "right",
    },
    {
      target: "[data-testid='nav-caja']",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">💰 Caja</h3>
          <p className="text-sm text-muted-foreground">Acá controlás el flujo de dinero del negocio:</p>
          <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc pl-4">
            <li><strong>Gastos variables</strong>: egresos que ocurren regularmente (alquiler, servicios)</li>
            <li><strong>Gastos fijos</strong>: costos puntuales del día a día</li>
            <li>Para cargar un gasto, entrá a Caja y usá el botón <em>"Registrar movimiento"</em></li>
            <li>Podés ver resúmenes mensuales, diarios y comparativas</li>
          </ul>
        </div>
      ),
      placement: "right",
    },
    {
      target: "[data-testid='nav-clientes']",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">👤 Clientes</h3>
          <p className="text-sm text-muted-foreground">Para crear un cliente:</p>
          <ol className="text-sm text-muted-foreground mt-2 space-y-1 list-decimal pl-4">
            <li>Entrá a <strong>Clientes</strong> desde el menú</li>
            <li>Hacé click en <em>"Nuevo cliente"</em></li>
            <li>Completá nombre, DNI y teléfono</li>
            <li>El cliente quedará guardado y podés asociarlo a ventas y pedidos</li>
          </ol>
        </div>
      ),
      placement: "right",
    },
    {
      target: "[data-testid='nav-pedidos']",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">📦 Pedidos</h3>
          <p className="text-sm text-muted-foreground">Para crear un pedido nuevo:</p>
          <ol className="text-sm text-muted-foreground mt-2 space-y-1 list-decimal pl-4">
            <li>Hacé click en <strong>Pedidos</strong> en el menú</li>
            <li>Usá el botón <em>"Nuevo pedido"</em></li>
            <li>Elegí un cliente, agregá ítems y configurá el estado</li>
            <li>Cada pedido tiene un link de seguimiento único para el cliente</li>
          </ol>
        </div>
      ),
      placement: "right",
    },
    {
      target: "[data-testid='nav-configuracion']",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">📋 Presets de pedidos</h3>
          <p className="text-sm text-muted-foreground">Los presets te permiten crear pedidos estándar con un click. Para crear uno:</p>
          <ol className="text-sm text-muted-foreground mt-2 space-y-1 list-decimal pl-4">
            <li>Andá a <strong>Configuración → Pedidos</strong></li>
            <li>En la sección <em>"Presets"</em>, creá un template con ítems predefinidos</li>
            <li>Al crear un pedido, podés elegir un preset y se carga automáticamente</li>
          </ol>
        </div>
      ),
      placement: "right",
    },
    {
      target: "[data-testid='nav-compras']",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">🛒 Cargar una compra</h3>
          <p className="text-sm text-muted-foreground">Cuando recibís mercadería de un proveedor:</p>
          <ol className="text-sm text-muted-foreground mt-2 space-y-1 list-decimal pl-4">
            <li>Andá a <strong>Compras</strong> en el menú</li>
            <li>Elegí <em>"Carga manual"</em> para ingresar ítem por ítem, o usá <em>"Importar Excel"</em></li>
            <li>Indicá el proveedor, código de producto, precio y cantidad</li>
            <li>Al guardar, el stock de los productos se actualiza automáticamente</li>
          </ol>
        </div>
      ),
      placement: "right",
    },
    {
      target: "[data-testid='nav-productos']",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">📦 Productos y Stock</h3>
          <p className="text-sm text-muted-foreground">En <strong>Productos</strong> podés:</p>
          <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc pl-4">
            <li>Crear y editar productos con precio, costo y código</li>
            <li>Ver el stock actual y renovarlo manualmente</li>
            <li>Filtrar por categoría, estado o rango de precio</li>
            <li>El stock se descuenta automáticamente al hacer una venta</li>
          </ul>
        </div>
      ),
      placement: "right",
    },
    {
      target: "[data-testid='nav-ventas']",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">🏪 Punto de Venta (POS)</h3>
          <p className="text-sm text-muted-foreground">El POS es tu módulo de ventas rápidas. Podés:</p>
          <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc pl-4">
            <li>Buscar productos por nombre o escanear código de barras</li>
            <li>Buscar y asociar un cliente a la venta</li>
            <li>Agregar descuentos o recargos</li>
            <li>Registrar con múltiples métodos de pago e imprimir el ticket</li>
          </ul>
        </div>
      ),
      placement: "right",
    },
    {
      target: ".joyride-user-profile",
      content: (
        <div className="text-left">
          <h3 className="font-bold mb-1">Ajustes y Perfil</h3>
          <p className="text-sm text-muted-foreground">Desde aquí gestionás los datos de tu empresa, tu plan actual y podés cerrar sesión.</p>
        </div>
      ),
      placement: "right",
    },
    {
      target: "body",
      placement: "center",
      content: (
        <div className="text-left">
          <h3 className="font-bold text-lg mb-2">¡Listo para empezar! 🚀</h3>
          <p className="text-sm text-muted-foreground">
            Ya conocés las herramientas principales de Orbia. Te recomendamos empezar por <strong>Configuración</strong> para personalizar tu negocio. Cualquier duda, contactanos directo por WhatsApp.
          </p>
        </div>
      ),
      disableBeacon: true,
    },
  ], []);

  const [safeTourSteps, setSafeTourSteps] = useState<Step[]>(tourSteps);

  const isStepTargetVisible = (target: Step["target"]) => {
    if (typeof window === "undefined") return true;
    if (!target || target === "body") return true;
    if (typeof target !== "string") return true;

    const element = document.querySelector(target) as HTMLElement | null;
    if (!element) return false;

    const styles = window.getComputedStyle(element);
    if (styles.display === "none" || styles.visibility === "hidden" || styles.opacity === "0") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const resolveStep = (step: Step): Step => {
    if (isStepTargetVisible(step.target)) return step;
    return fallbackTourStep;
  };

  useEffect(() => {
    if (!user) return;
    const ownerLike = ["admin", "owner"].includes(String((user as any).role || "").toLowerCase());
    if (!ownerLike) return;

    const templateKey = `orbia:onboarding:template-selected:${user.id}`;
    const templateSelected = localStorage.getItem(templateKey) === "1";

    if (!templateSelected) {
      setShowTemplateSelector(true);
      return;
    }

    const key = `orbia:onboarding:dismissed:${user.id}`;
    const dismissed = localStorage.getItem(key) === "1";
    if (!dismissed) {
      setTimeout(() => setRunTour(true), 500);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!runTour) return;
    setSafeTourSteps(tourSteps.map(resolveStep));
  }, [runTour, location, tourSteps]);
  useEffect(() => {
    if (!isAuthenticated || user?.isSuperAdmin || user?.role === "CASHIER") return;
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/branches/me");
        const json = await res.json();
        const data = Array.isArray(json?.data) ? json.data.map((b: any) => ({ id: Number(b.id), name: String(b.name || `Sucursal #${b.id}`) })) : [];
        setBranches(data);
        if (data.length > 0) {
          const current = getActiveBranchId();
          const exists = current && data.some((b: BranchOption) => b.id === current);
          const next = exists ? current : data[0].id;
          setActiveBranchId(next);
          setActiveBranchIdState(next);
        }
      } catch {
        setBranches([]);
      }
    })();
  }, [isAuthenticated, user?.id, user?.role]);


  const applyTemplate = async (templateCode: "SERVICIO_TECNICO" | "TIENDA_ROPA" | "GENERAL") => {
    if (!user?.id) return;
    try {
      setIsApplyingTemplate(true);
      const res = await apiRequest("POST", "/api/tenants/apply-template", { templateCode });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "No se pudo aplicar la plantilla seleccionada.");
      }

      localStorage.setItem(`orbia:onboarding:template-selected:${user.id}`, "1");
      setShowTemplateSelector(false);
      toast({
        title: "Plantilla aplicada",
        description: "Configuramos Orbia para tu tipo de negocio. Podés editar estos campos cuando quieras.",
      });
      setLocation("/app/settings/orders");
      setTimeout(() => setRunTour(true), 500);
    } catch (err: any) {
      toast({
        title: "No pudimos aplicar la plantilla",
        description: err?.message || "Revisá la conexión e intentá de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, type, action, index = 0 } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      if (user?.id) localStorage.setItem(`orbia:onboarding:dismissed:${user.id}`, "1");
      setRunTour(false);
      setStepIndex(0);
      return;
    }

    if (type === "step:after") {
      setStepIndex((prev) => {
        if (action === "prev") return Math.max(prev - 1, 0);
        return Math.min(prev + 1, safeTourSteps.length - 1);
      });
      return;
    }

    if (type === "error:target_not_found") {
      setSafeTourSteps((prev) => prev.map((step, i) => (i === index ? fallbackTourStep : step)));
      setStepIndex(index);
    }
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
            <div className="flex items-center gap-2">
              {user?.role !== "CASHIER" && branches.length > 0 && (
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={activeBranchId || ""}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    const next = Number.isFinite(value) && value > 0 ? value : null;
                    setActiveBranchId(next);
                    setActiveBranchIdState(next);
                    if (next) toast({ title: "Sucursal activa actualizada", description: "Filtramos la información según tu sucursal seleccionada." });
                  }}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              )}
              <ThemeToggle />
            </div>
          </header>
          <SubscriptionBanner />
          {showTemplateSelector && user?.role !== "CASHIER" && (
            <div className="mx-4 mt-4 rounded-xl border bg-card p-4 shadow-sm" data-testid="onboarding-template-selector">
              <h2 className="text-lg font-semibold">¿Qué tipo de negocio tenés?</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-3">Elegí una opción y configuramos presets, campos y seguimientos automáticamente.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button disabled={isApplyingTemplate} onClick={() => applyTemplate("SERVICIO_TECNICO")}>Servicio técnico</Button>
                <Button disabled={isApplyingTemplate} variant="secondary" onClick={() => applyTemplate("TIENDA_ROPA")}>Tienda de ropa</Button>
                <Button disabled={isApplyingTemplate} variant="outline" onClick={() => applyTemplate("GENERAL")}>Otro</Button>
              </div>
            </div>
          )}
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
              {user?.role !== "CASHIER" && <Route path="/app/audit" component={AuditPage} />}
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
          <Joyride
            steps={safeTourSteps}
            run={runTour}
            stepIndex={stepIndex}
            continuous
            showProgress
            showSkipButton
            callback={handleJoyrideCallback}
            disableScrolling
            scrollToFirstStep={false}
            spotlightClicks
            styles={{
              options: {
                primaryColor: 'hsl(var(--primary))',
                textColor: 'hsl(var(--foreground))',
                backgroundColor: 'hsl(var(--card))',
                overlayColor: 'rgba(0, 0, 0, 0.6)',
              },
              tooltipContainer: {
                textAlign: 'left',
              },
              buttonNext: {
                backgroundColor: 'hsl(var(--primary))',
                borderRadius: 'var(--radius)',
              },
              buttonBack: {
                color: 'hsl(var(--muted-foreground))',
              }
            }}
            locale={{
              ...UI_TEXTS_ES_AR.onboarding.locale,
            }}
          />
          <GlobalVoiceFab />
        </div>
      </div>
    </SidebarProvider>
  );
}
