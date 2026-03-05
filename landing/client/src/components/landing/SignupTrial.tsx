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
    companyName: "",
    ownerName: "",
    email: "",
    password: "",
    industry: "",
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
              <div className="space-y-3">
                <p className="font-medium">¡Listo! Tu empresa ya está creada.</p>
                <p className="text-sm text-muted-foreground">Tu código de empresa es: <strong>{success.tenantCode}</strong></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={copyCode}>Copiar código</Button>
                  <Button asChild>
                    <a href={success.loginUrl}>Ir a iniciar sesión</a>
                  </Button>
                </div>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={onSubmit}>
                <div><Label>Empresa</Label><Input value={form.companyName} onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))} required /></div>
                <div><Label>Nombre del dueño/admin</Label><Input value={form.ownerName} onChange={(e) => setForm((s) => ({ ...s, ownerName: e.target.value }))} required /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required /></div>
                <div><Label>Contraseña</Label><Input type="password" minLength={6} value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} required /></div>
                <div><Label>Rubro</Label><Input value={form.industry} onChange={(e) => setForm((s) => ({ ...s, industry: e.target.value }))} required /></div>
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
