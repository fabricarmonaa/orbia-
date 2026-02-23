import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DeliveryLogin() {
  const [, setLocation] = useLocation();
  const [tenantCode, setTenantCode] = useState("");
  const [dni, setDni] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/delivery/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantCode, dni, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error de autenticación");
      }
      localStorage.setItem("delivery_token", data.token);
      localStorage.setItem("delivery_agent", JSON.stringify(data.agent));
      localStorage.setItem("delivery_tenant_name", data.tenantName || "");
      setLocation("/delivery/panel");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-md bg-primary flex items-center justify-center">
            <Truck className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">Panel de Delivery</h1>
          <p className="text-sm text-muted-foreground">Ingresá con tu código de negocio, DNI y PIN: 6 dígitos</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Código del negocio</Label>
              <Input
                placeholder="mi-negocio"
                value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value)}
                required
                data-testid="input-delivery-tenant-code"
              />
            </div>
            <div className="space-y-2">
              <Label>DNI</Label>
              <Input
                placeholder="12345678"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                required
                data-testid="input-delivery-dni"
              />
            </div>
            <div className="space-y-2">
              <Label>PIN: 6 dígitos</Label>
              <Input
                type="password"
                maxLength={6}
                placeholder="123456"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                data-testid="input-delivery-pin"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-delivery-login">
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
