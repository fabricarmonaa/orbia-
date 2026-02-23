import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, ArrowUpRight } from "lucide-react";
import { usePlan } from "@/lib/plan";
import { apiRequest } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface UpgradePromptProps {
  feature: string;
  title: string;
  description: string;
}

const featureNames: Record<string, string> = {
  products: "Productos",
  branches: "Sucursales",
  cash_sessions: "Caja con Sesiones",
  fixed_expenses: "Gastos Fijos",
  variable_expenses: "Gastos Variables",
  reports_advanced: "Reportes Avanzados",
  stt: "Voz IA (STT)",
};

const planUpgradeSuggestions: Record<string, string> = {
  ECONOMICO: "Profesional",
  PROFESIONAL: "Escala",
};

export function UpgradePrompt({ feature, title, description }: UpgradePromptProps) {
  const { plan } = usePlan();
  const { toast } = useToast();
  const [tenantCode, setTenantCode] = useState<string>("");
  const suggestedPlan = plan ? planUpgradeSuggestions[plan.planCode] || "superior" : "superior";

  useEffect(() => {
    let mounted = true;
    apiRequest("GET", "/api/tenant/info")
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setTenantCode(data?.data?.code || "");
      })
      .catch(() => {
        if (mounted) setTenantCode("");
      });
    return () => {
      mounted = false;
    };
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2" data-testid="text-upgrade-title">
            Funcionalidad no disponible
          </h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto">
            La funcionalidad de <strong>{featureNames[feature] || feature}</strong> no está
            incluida en tu plan actual
            {plan && (
              <>
                {" "}
                <Badge variant="secondary">{plan.name}</Badge>
              </>
            )}
            .
          </p>
          <div className="inline-flex items-center gap-2 text-sm text-primary font-medium mb-4">
            <ArrowUpRight className="w-4 h-4" />
            <span data-testid="text-upgrade-suggestion">
              Mejorá al plan {suggestedPlan} para acceder
            </span>
          </div>
          <div>
            <Button onClick={openUpgradeWhatsApp}>Mejorar plan</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
