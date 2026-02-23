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

const addonLabels: Record<string, string> = {
  delivery: "Delivery",
  messaging_whatsapp: "Mensajería (WhatsApp)",
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
  const [transferInfo, setTransferInfo] = useState<any>(null);
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

    apiRequest("GET", "/api/subscription/transfer-info")
      .then((res) => res.json())
      .then((data) => setTransferInfo(data?.data || null))
      .catch(() => setTransferInfo(null));

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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Plan actual</p>
                <p className="text-xl font-semibold">{plan.name}</p>
              </div>
              <Badge variant={mapSubscriptionState(subscriptionStatus?.status) === "ACTIVA" ? "default" : "destructive"}>{mapSubscriptionState(subscriptionStatus?.status)}</Badge>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div><p className="text-muted-foreground">Vence</p><p>{formatDate(subscriptionStatus?.subscriptionEndDate)}</p></div>
              <div><p className="text-muted-foreground">Precio</p><p>{plan.priceMonthly ? `${plan.currency || "ARS"} ${plan.priceMonthly}` : "—"}</p></div>
              <div><p className="text-muted-foreground">Días restantes</p><p>{subscriptionStatus?.daysToExpire ?? "—"}</p></div>
            </div>
            <div className="flex gap-2">
              <Button onClick={openUpgradeWhatsApp}>Renovar / Informar pago por WhatsApp</Button>
            </div>
            <div className="rounded border p-3 text-sm space-y-1">
              <p className="font-medium">Transferencia</p>
              <p>Alias: {transferInfo?.alias || "—"}</p>
              <p>CBU: {transferInfo?.cbu || "—"}</p>
              <p>Titular: {transferInfo?.account_holder || "—"}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sin plan asignado</p>
        )}
      </CardContent>
    </Card>
  );
}
