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
      const parentOrigin = window.location.origin;
      const res = await fetch(`${API_BASE}/api/auth/google/start?intent=login&parentOrigin=${encodeURIComponent(parentOrigin)}`);
      const data = await res.json();

      if (!res.ok || !data?.url) {
        throw new Error(data.error || "No se pudo iniciar Google.");
      }

      const popup = window.open(data.url, "orbia-google-login", "width=520,height=720");
      if (!popup) {
        throw new Error("Tu navegador bloqueó la ventana emergente. Habilitá los popups para continuar.");
      }

      const expectedOrigin = new URL(data.url).origin;
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener("message", listener);
        setLoading(false);
        setError("No pudimos completar la autorización con Google. Intentá nuevamente.");
      }, 60000);

      const listener = (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) return;
        if (event.data?.type !== "orbia-google-auth") return;

        window.removeEventListener("message", listener);
        window.clearTimeout(timeoutId);

        if (!event.data?.ok) {
          setError(event.data?.message || "Ocurrió un error en la autorización.");
          setLoading(false);
          return;
        }

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
