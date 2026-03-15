import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Building2, Eye, EyeOff } from "lucide-react";
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
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const { toast } = useToast();
  const { appBranding } = useBranding();

  // Auto-redirect if a valid tenant session already exists in localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // SSO login from landing page
    const ssoToken = params.get("ssoToken");
    const ssoUser = params.get("ssoUser");
    if (ssoToken && ssoUser) {
      try {
        const user = JSON.parse(decodeURIComponent(ssoUser));
        login(ssoToken, user);
        // Remove params from URL and redirect
        window.history.replaceState({}, document.title, window.location.pathname);
        setLocation("/app");
        return;
      } catch (err) {
        console.error("SSO Login failed:", err);
      }
    }

    const token = getToken();
    const user = getUser();
    if (token && user && !user.isSuperAdmin) {
      setLocation("/app");
      return;
    }

    const fromQuery = params.get("tenant") || params.get("tenantCode") || params.get("tenant_code");
    if (fromQuery) setTenantCode(fromQuery);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      if (!res.ok) throw new Error(data.error || "Error de autenticación");
      login(data.token, { ...data.user, subscriptionWarning: data.subscriptionWarning });
      setLocation("/app");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }



  async function handleGoogleLogin() {
    try {
      const parentOrigin = window.location.origin;
      const res = await fetch(`/api/auth/google/start?intent=login&parentOrigin=${encodeURIComponent(parentOrigin)}`);
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data.error || "No se pudo iniciar Google");
      const popup = window.open(data.url, "orbia-google-login", "width=520,height=720");
      if (!popup) throw new Error("Tu navegador bloqueó la ventana emergente de Google.");
      const expectedOrigin = window.location.origin;
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener("message", listener);
        toast({ title: "No se pudo ingresar con Google", description: "La autorización tardó demasiado. Intentá nuevamente.", variant: "destructive" });
      }, 180000);

      const listener = (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) return;
        if (event.data?.type !== "orbia-google-auth") return;
        window.removeEventListener("message", listener);
        window.clearTimeout(timeoutId);
        if (!event.data?.ok) {
          toast({ title: "No se pudo ingresar con Google", description: event.data?.message || "Intentá nuevamente.", variant: "destructive" });
          return;
        }
        login(event.data.token, event.data.user);
        toast({ title: "Sesión iniciada", description: "Ingresaste con Google correctamente." });
        setLocation("/app");
      };
      window.addEventListener("message", listener);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "No se pudo iniciar Google Sign-In", variant: "destructive" });
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo procesar la solicitud");
      toast({
        title: "Revisá tu correo",
        description: data.message || "Si el correo está registrado, te enviamos un enlace de recuperación.",
      });
      setForgotOpen(false);
      setForgotEmail("");
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
            <BrandLogo
              src={appBranding.orbiaLogoUrl}
              alt={appBranding.orbiaName || "ORBIA"}
              brandName={appBranding.orbiaName || "ORBIA"}
              variant="login"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {appBranding.orbiaName || "ORBIA"}
          </h1>
          <p className="text-muted-foreground mt-1">Plataforma de gestión comercial integral</p>
        </div>
        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">
              Ingresá con tu código de negocio y credenciales
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={mode === "admin" ? "default" : "outline"} onClick={() => setMode("admin")}>Ingresar como Administrador</Button>
                <Button type="button" variant={mode === "cashier" ? "default" : "outline"} onClick={() => setMode("cashier")}>Ingresar como Cajero</Button>
              </div>

              {mode === "cashier" && (
                <div className="space-y-2">
                  <Label htmlFor="tenantCode">Código de negocio</Label>
                  <Input
                    id="tenantCode"
                    placeholder="Codigo del negocio"
                    value={tenantCode}
                    onChange={(e) => setTenantCode(e.target.value)}
                    required
                    data-testid="input-tenant-code"
                  />
                </div>
              )}
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
                    <button
                      type="button"
                      onClick={() => setForgotOpen(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      Olvidé mi contraseña
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="pin">PIN</Label>
                  <Input id="pin" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} required data-testid="input-cashier-pin" />
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                data-testid="button-login"
              >
                {loading ? "Ingresando..." : "Ingresar"}
              </Button>
              {mode === "admin" && (
                <div className="pt-2">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">O</span>
                    </div>
                  </div>
                  <Button type="button" variant="outline" className="w-full flex items-center gap-2 border-muted-foreground/20 hover:bg-muted/50" onClick={handleGoogleLogin}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Continuar con Google
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          {appBranding.orbiaName || "ORBIA"} Platform v1.0
        </p>

        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Recuperar contraseña</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ingresá tu correo y te enviaremos un enlace para restablecer tu contraseña.
              </p>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Correo</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="tu-correo@empresa.com"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={forgotLoading}>
                {forgotLoading ? "Enviando..." : "Enviar enlace de recuperación"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
