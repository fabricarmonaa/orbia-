import { useEffect, useMemo, useState } from "react";
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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("token") || "").trim();
  }, []);

  async function validateToken() {
    if (!token) {
      setTokenValid(false);
      return;
    }
    setValidating(true);
    try {
      const res = await fetch(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      setTokenValid(!!data.valid);
      if (!data.valid) {
        toast({ title: "Enlace inválido", description: data.error || "El enlace no es válido", variant: "destructive" });
      }
    } catch {
      setTokenValid(false);
      toast({ title: "Error", description: "No se pudo validar el enlace", variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }

  useEffect(() => {
    void validateToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast({ title: "Enlace inválido", description: "Falta el token de recuperación", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar la contraseña");
      toast({ title: "Contraseña actualizada", description: "Ya podés iniciar sesión con tu nueva contraseña." });
      setLocation("/login");
    } catch (err: any) {
      toast({ title: "No se pudo restablecer", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <h1 className="text-xl font-semibold">Restablecer contraseña</h1>
          <p className="text-sm text-muted-foreground">Elegí una nueva contraseña para tu cuenta.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {tokenValid === null ? (
            <p className="text-sm text-muted-foreground">{validating ? "Validando enlace..." : "Preparando formulario..."}</p>
          ) : tokenValid ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva contraseña</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ingresá tu nueva contraseña"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repetí tu nueva contraseña"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Guardando..." : "Guardar nueva contraseña"}
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-destructive">El enlace de recuperación es inválido o venció.</p>
              <Button variant="outline" className="w-full" onClick={() => setLocation("/login")}>Volver al login</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
