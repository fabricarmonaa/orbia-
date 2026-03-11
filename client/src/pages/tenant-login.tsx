import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { login, getToken, getUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/context/BrandingContext";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function TenantLogin() {
  const [, setLocation] = useLocation();
  const [tenantCode, setTenantCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"admin" | "cashier">("admin");
  const [pin, setPin] = useState("");
  const [lockedSeconds, setLockedSeconds] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const { toast } = useToast();
  const { appBranding } = useBranding();

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (token && user && !user.isSuperAdmin) {
      setLocation("/app");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("tenant") || params.get("tenantCode") || params.get("tenant_code");
    if (fromQuery) setTenantCode(fromQuery);
  }, []);

  useEffect(() => {
    if (lockedSeconds <= 0) return;
    const id = window.setInterval(() => setLockedSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [lockedSeconds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lockedSeconds > 0) {
      toast({ title: "Inicio bloqueado", description: `Esperá ${lockedSeconds}s antes de volver a intentar`, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === "cashier" ? "/api/cashiers/login" : "/api/auth/login";
      const body = mode === "cashier"
        ? { tenant_code: tenantCode, pin }
        : { tenantCode, email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setLockedSeconds(Number(data.lockedSeconds || 0));
        throw new Error(data.error || "Error de autenticación");
      }
      setLockedSeconds(0);
      login(data.token, { ...data.user, subscriptionWarning: data.subscriptionWarning });
      setLocation("/app");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/password-recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantCode,
          email: forgotEmail.trim().toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo procesar la solicitud");
      toast({ title: "Solicitud recibida", description: "Si los datos coinciden, te enviamos un correo para restaurar tu contraseña." });
      setForgotOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <BrandLogo src={appBranding.orbiaLogoUrl} alt={appBranding.orbiaName || "ORBIA"} brandName={appBranding.orbiaName || "ORBIA"} variant="login" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{appBranding.orbiaName || "ORBIA"}</h1>
          <p className="text-muted-foreground mt-1">Plataforma de gestión comercial integral</p>
        </div>
        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">Ingresá con tu código de negocio y credenciales</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={mode === "admin" ? "default" : "outline"} onClick={() => setMode("admin")}>Ingresar como Administrador</Button>
                <Button type="button" variant={mode === "cashier" ? "default" : "outline"} onClick={() => setMode("cashier")}>Ingresar como Cajero</Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenantCode">Código de negocio</Label>
                <Input id="tenantCode" placeholder="Codigo del negocio" value={tenantCode} onChange={(e) => setTenantCode(e.target.value)} required data-testid="input-tenant-code" />
              </div>

              {mode === "admin" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="Email empresa/dueño" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="input-password" />
                      <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowPassword(!showPassword)} data-testid="button-toggle-password">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="pin">PIN</Label>
                  <Input id="pin" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} required data-testid="input-cashier-pin" />
                </div>
              )}

              {lockedSeconds > 0 && mode === "admin" && (
                <p className="text-xs text-destructive">Inicio temporalmente bloqueado. Intentá nuevamente en {lockedSeconds}s.</p>
              )}


              {mode === "admin" && (
                <Button type="button" variant="ghost" className="px-0 h-auto underline" onClick={() => {
                  setForgotEmail(email);
                  setForgotOpen(true);
                }}>
                  ¿Olvidaste tu contraseña?
                </Button>
              )}

              <Button type="submit" className="w-full" disabled={loading || lockedSeconds > 0} data-testid="button-login">
                {loading ? "Ingresando..." : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">{appBranding.orbiaName || "ORBIA"} Platform v1.0</p>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperar contraseña</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleForgotPassword}>
            <div className="space-y-2">
              <Label>Email registrado</Label>
              <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={forgotLoading || !tenantCode.trim()}>
              {forgotLoading ? "Enviando..." : "Enviar enlace de restauración"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
