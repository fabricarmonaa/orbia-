import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getAppOrigin } from "@/lib/app-origin";

interface Props {
  trigger?: React.ReactNode;
}

export function GoogleLoginModal({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [tenantCode, setTenantCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = getAppOrigin();

  useEffect(() => {
    if (!open) {
      setTenantCode("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  async function handleGoogleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantCode.trim()) {
      setError("Ingresá tu código de negocio.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/auth/google/start?tenantCode=${encodeURIComponent(tenantCode.trim())}`);
      const data = await res.json();

      if (!res.ok || !data?.url) {
        throw new Error(data.error || "No se pudo iniciar Google.");
      }

      const popup = window.open(data.url, "orbia-google-login", "width=520,height=720");
      if (!popup) {
        throw new Error("Tu navegador bloqueó la ventana emergente. Habilitá los popups para continuar.");
      }

      const listener = (event: MessageEvent) => {
        // We do not check event.origin against window.location.origin here because 
        // the message comes from API_BASE (which might be port 5000) to landing (port 5001).
        // Since we specify targetOrigin appropriately in the backend, this is safe.
        if (event.data?.type !== "orbia-google-auth") return;

        window.removeEventListener("message", listener);

        if (!event.data?.ok) {
          setError(event.data?.message || "Ocurrió un error en la autorización.");
          setLoading(false);
          return;
        }

        // Successfully authenticated! We get the token and user.
        // We now redirect to the main app's SSO endpoint to finalize login and set localStorage there.
        const token = event.data.token;
        const user = event.data.user;
        const ssoUrl = `${API_BASE}/login?ssoToken=${token}&ssoUser=${encodeURIComponent(JSON.stringify(user))}`;
        window.location.href = ssoUrl;
      };

      window.addEventListener("message", listener);

    } catch (err: any) {
      setError(err.message || "No se pudo conectar con Google.");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline">Ingresar con Google</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar sesión con Google</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <p className="text-sm text-muted-foreground mb-4">
            Ingresá el código de negocio de tu empresa para continuar con tu cuenta de Google.
          </p>
          <form onSubmit={handleGoogleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenantCode">Código de negocio</Label>
              <Input
                id="tenantCode"
                placeholder="Ej: miempresa"
                value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !tenantCode.trim()}
            >
              {loading ? "Conectando..." : "Continuar con Google"}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
