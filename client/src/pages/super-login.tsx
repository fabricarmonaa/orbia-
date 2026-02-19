import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/auth";
import { parseApiError } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/context/BrandingContext";
import { BrandLogo } from "@/components/branding/BrandLogo";

export default function SuperLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { appBranding } = useBranding();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/super/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, totpCode: totpCode || undefined }),
      });
      if (!res.ok) {
        const info = await parseApiError(res);
        throw new Error(info.message);
      }
      const data = await res.json();
      login(data.token, data.user);
      setLocation("/owner");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
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
          <p className="text-muted-foreground mt-1">Panel de Administración Global</p>
        </div>
        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold">Super Admin</h2>
            <p className="text-sm text-muted-foreground">
              Acceso restringido a administración global
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@plataforma.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="input-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totp">Código 2FA (si está habilitado)</Label>
                <Input
                  id="totp"
                  inputMode="numeric"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  data-testid="input-totp"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                data-testid="button-login"
              >
                {loading ? "Ingresando..." : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          {appBranding.orbiaName || "ORBIA"} Platform v1.0
        </p>
      </div>
    </div>
  );
}
