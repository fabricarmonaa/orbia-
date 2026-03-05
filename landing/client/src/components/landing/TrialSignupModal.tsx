import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { postPublicOnboard } from "@/lib/api";

type TrialSignupModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TrialSignupModal({ open, onOpenChange }: TrialSignupModalProps) {
  const [form, setForm] = useState({
    tenantName: "",
    adminName: "",
    dni: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await postPublicOnboard({
        tenantName: form.tenantName,
        adminName: form.adminName,
        dni: form.dni || undefined,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
      });
      window.location.href = response.loginUrl;
    } catch (err: any) {
      setError(err?.message || "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Iniciá tu prueba gratis</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div><Label>Empresa</Label><Input value={form.tenantName} onChange={(e) => setForm((s) => ({ ...s, tenantName: e.target.value }))} required /></div>
          <div><Label>Nombre admin</Label><Input value={form.adminName} onChange={(e) => setForm((s) => ({ ...s, adminName: e.target.value }))} required /></div>
          <div><Label>DNI</Label><Input value={form.dni} onChange={(e) => setForm((s) => ({ ...s, dni: e.target.value }))} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required /></div>
          <div><Label>Teléfono (opcional)</Label><Input value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} /></div>
          <div><Label>Contraseña</Label><Input type="password" minLength={6} value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} required /></div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creando..." : "Crear cuenta"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
