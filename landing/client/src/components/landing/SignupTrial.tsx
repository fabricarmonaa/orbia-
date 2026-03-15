import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { postPublicOnboard } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { getAppOrigin } from "@/lib/app-origin";

export function SignupTrial() {
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tenantCode: string; loginUrl: string } | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const appOrigin = getAppOrigin();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acceptedTerms) {
      setError("Tenés que aceptar los Términos y Condiciones para continuar.");
      return;
    }
    setLoading(true);
    try {
      const res = await postPublicOnboard(form);
      setSuccess({ tenantCode: res.tenantCode, loginUrl: res.loginUrl });
    } catch (err: any) {
      setError(err?.message || "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  async function copyCode() {
    if (!success?.tenantCode) return;
    await navigator.clipboard.writeText(success.tenantCode);
  }

  async function handleGoogleSignup() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${appOrigin}/api/auth/google/start?intent=login`);
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data.error || "No se pudo iniciar Google.");

      const popup = window.open(data.url, "orbia-google-login", "width=520,height=720");
      if (!popup) throw new Error("Tu navegador bloqueó la ventana emergente.");

      const listener = (event: MessageEvent) => {
        if (event.data?.type !== "orbia-google-auth") return;
        window.removeEventListener("message", listener);

        if (!event.data?.ok) {
          setError(event.data?.message || "Ocurrió un error en la autorización.");
          setLoading(false);
          return;
        }

        const ssoUrl = `${appOrigin}/login?ssoToken=${event.data.token}&ssoUser=${encodeURIComponent(JSON.stringify(event.data.user))}`;
        window.location.href = ssoUrl;
      };
      window.addEventListener("message", listener);
    } catch (err: any) {
      setError(err.message || "No se pudo conectar con Google.");
      setLoading(false);
    }
  }

  return (
    <section id="signup" className="py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 grid md:grid-cols-2 gap-8 items-start">
        <div>
          <h2 className="text-3xl font-bold mb-3">Iniciá tu prueba gratis</h2>
          <p className="text-muted-foreground mb-4">Completá estos datos y te creamos la empresa al instante para entrar a la app.</p>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
            <li>Alta automática de empresa y usuario administrador.</li>
            <li>Prueba gratis activa al crear tu cuenta.</li>
            <li>Acceso inmediato al login del panel.</li>
          </ul>
        </div>

        <Card>
          <CardHeader><CardTitle>Crear cuenta</CardTitle></CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-4 text-center py-6">
                <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h3 className="text-xl font-bold">¡Cuenta creada con éxito!</h3>
                <p className="text-muted-foreground text-sm">
                  Ya podés ingresar a Orbia. Te vamos a pedir un par de datos de tu negocio en el primer inicio de sesión para terminar de configurarlo.
                </p>
                <div className="pt-2">
                  <Button asChild className="w-full">
                    <a href={success.loginUrl}>Continuar al Panel</a>
                  </Button>
                </div>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={onSubmit}>
                <Button type="button" variant="outline" className="w-full flex items-center justify-center gap-2 border-muted-foreground/20 hover:bg-muted/50" onClick={handleGoogleSignup} disabled={loading}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Continuar con Google
                </Button>
                
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">O registrate con email</span>
                  </div>
                </div>

                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required /></div>
                <div><Label>Contraseña</Label><Input type="password" minLength={6} value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} required /></div>
                <div className="flex items-start gap-2">
                  <Checkbox id="signup-accept-terms" checked={acceptedTerms} onCheckedChange={(v) => setAcceptedTerms(Boolean(v))} />
                  <Label htmlFor="signup-accept-terms" className="text-sm leading-snug">
                    Acepto los{" "}
                    <a href={`${appOrigin}/legal/terms`} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
                      Términos y Condiciones
                    </a>
                    {" "}y la{" "}
                    <a href={`${appOrigin}/legal/privacy`} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
                      Política de Privacidad
                    </a>
                  </Label>
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={loading || !acceptedTerms}>{loading ? "Creando..." : "Iniciar prueba gratis"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
