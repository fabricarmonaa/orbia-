import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);

  async function validateToken() {
    if (!token) return;
    setValidating(true);
    try {
      const res = await fetch(`/api/auth/password-recovery/validate?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Token inválido o expirado");
      setEmail(json.data?.email || "");
    } catch (err: any) {
      toast({ title: "Enlace inválido", description: err.message, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }

  if (!email && !validating) {
    void validateToken();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast({ title: "Error", description: "Token inválido", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Contraseña inválida", description: "La contraseña debe tener al menos 6 caracteres", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Contraseñas distintas", description: "La confirmación no coincide", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo restablecer la contraseña");
      toast({ title: "Contraseña actualizada", description: "Ya podés iniciar sesión con la nueva contraseña." });
      setLocation("/login");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold">Restablecer contraseña</h1>
          <p className="text-sm text-muted-foreground">Por seguridad, el email asociado no se puede modificar en este paso.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} disabled placeholder="Validando token..." />
            </div>
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Confirmar contraseña</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !email}>
              {loading ? "Actualizando..." : "Guardar nueva contraseña"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
