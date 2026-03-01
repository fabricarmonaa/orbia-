import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { postPublicSignup } from "@/lib/api";

export function SignupTrial() {
  const [form, setForm] = useState({
    companyName: "",
    ownerName: "",
    email: "",
    phone: "",
    password: "",
    industry: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tenantCode: string; nextUrl: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await postPublicSignup(form);
      setSuccess({ tenantCode: res.tenantCode, nextUrl: res.nextUrl });
    } catch (err: any) {
      setError(err?.message || "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="signup" className="py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 grid md:grid-cols-2 gap-8 items-start">
        <div>
          <h2 className="text-3xl font-bold mb-3">Iniciá tu prueba gratis</h2>
          <p className="text-muted-foreground mb-4">Creá tu cuenta en menos de 2 minutos. Activamos automáticamente 3 días de trial con plan profesional + mensajería.</p>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
            <li>Alta instantánea de empresa, sucursal y usuario administrador.</li>
            <li>Sin tarjeta de crédito.</li>
            <li>Acceso inmediato a app.orbiapanel.com.</li>
          </ul>
        </div>

        <Card>
          <CardHeader><CardTitle>Crear cuenta</CardTitle></CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-3">
                <p className="font-medium">¡Cuenta creada con éxito!</p>
                <p className="text-sm text-muted-foreground">Código de negocio: <strong>{success.tenantCode}</strong></p>
                <Button asChild className="w-full">
                  <a href={success.nextUrl}>Ir al panel</a>
                </Button>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={onSubmit}>
                <div><Label>Empresa</Label><Input value={form.companyName} onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))} required /></div>
                <div><Label>Nombre del dueño/a</Label><Input value={form.ownerName} onChange={(e) => setForm((s) => ({ ...s, ownerName: e.target.value }))} required /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required /></div>
                <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} /></div>
                <div><Label>Rubro</Label><Input value={form.industry} onChange={(e) => setForm((s) => ({ ...s, industry: e.target.value }))} /></div>
                <div><Label>Contraseña</Label><Input type="password" minLength={6} value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} required /></div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creando..." : "Iniciá tu prueba gratis"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
