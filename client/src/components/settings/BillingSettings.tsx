import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth";
import type { PlanInfo } from "@/lib/plan";
import { useToast } from "@/hooks/use-toast";

const featureLabels: Record<string, string> = {
  orders: "Pedidos / Servicios",
  tracking: "Tracking Público",
  cash_simple: "Caja Simple",
  cash_sessions: "Caja con Sesiones",
  products: "Productos y Categorías",
  branches: "Multi-Sucursal",
  fixed_expenses: "Gastos Fijos",
  variable_expenses: "Gastos Variables",
  reports_advanced: "Reportes Avanzados",
  stt: "Voz IA (STT)",
};

const limitLabels: Record<string, string> = {
  max_branches: "Máx. Sucursales",
  max_staff_users: "Máx. Staff",
  max_orders_month: "Pedidos/mes",
  tracking_retention_min_hours: "Tracking mín. (horas)",
  tracking_retention_max_hours: "Tracking máx. (horas)",
};


function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR");
}

function mapSubscriptionState(status?: string | null) {
  if (status === "blocked") return "VENCIDA";
  return "ACTIVA";
}

export function BillingSettings({ plan }: { plan: PlanInfo | null }) {
  const [addons, setAddons] = useState<Record<string, boolean>>({});
  const [tenantCode, setTenantCode] = useState<string>("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    apiRequest("GET", "/api/addons/status")
      .then((res) => res.json())
      .then((data) => setAddons(data.data || {}))
      .catch(() => setAddons({}));

    apiRequest("GET", "/api/tenant/info")
      .then((res) => res.json())
      .then((data) => setTenantCode(data?.data?.code || ""))
      .catch(() => setTenantCode(""));

    apiRequest("GET", "/api/subscription/status")
      .then((res) => res.json())
      .then((data) => setSubscriptionStatus(data?.data || null))
      .catch(() => setSubscriptionStatus(null));
  }, []);

  function openUpgradeWhatsApp() {
    if (!tenantCode) {
      toast({ title: "No se pudo obtener el código de negocio", variant: "destructive" });
      return;
    }
    const text = `Hola! Mi código de negocio es ${tenantCode} y quiero mejorar mi plan`;
    const url = `https://wa.me/5492236979026?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">Plan y suscripción</h3>
        <p className="text-sm text-muted-foreground">Detalle de tu plan actual y addons</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan ? (
          <>
            <div className="flex items-center gap-2">
              <Badge variant="default">{plan.name}</Badge>
              <Button variant="outline" size="sm" onClick={openUpgradeWhatsApp}>
                Mejorar plan
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Funcionalidades</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {Object.entries(plan.features || {}).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{featureLabels[key] || key}</span>
                    <span>{val ? "Sí" : "No"}</span>
                  </div>
                ))}
              </div>
            </div>
            {plan.limits && Object.keys(plan.limits).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Límites</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {Object.entries(plan.limits).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{limitLabels[key] || key}</span>
                      <span>{val === -1 ? "Ilimitado" : val === 0 ? "No incluido" : val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suscripción</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Fecha inicio</span><span>{formatDate(subscriptionStatus?.subscriptionStartDate)}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Fecha vencimiento</span><span>{formatDate(subscriptionStatus?.subscriptionEndDate)}</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Estado</span><span>{mapSubscriptionState(subscriptionStatus?.status)}</span></div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Addons activos</p>
              <div className="flex flex-wrap gap-2 text-sm">
                {Object.keys(addons).length === 0 && <span className="text-muted-foreground">Sin addons activos</span>}
                {Object.entries(addons)
                  .filter(([, enabled]) => enabled)
                  .map(([addon]) => (
                    <Badge key={addon} variant="secondary">{addon}</Badge>
                  ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sin plan asignado</p>
        )}
      </CardContent>
    </Card>
  );
}
