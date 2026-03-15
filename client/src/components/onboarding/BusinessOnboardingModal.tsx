import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiRequest, useAuth } from "@/lib/auth";
import { useBranding } from "@/context/BrandingContext";
import { useToast } from "@/hooks/use-toast";

export function BusinessOnboardingModal() {
  const { user } = useAuth();
  const { tenantBranding, refreshBranding } = useBranding();
  const { toast } = useToast();
  
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Solo mostramos el modal si es el administrador principal y el nombre está pendiente
    if (user?.role === "admin" && tenantBranding?.displayName === "Mi Negocio") {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [user?.role, tenantBranding?.displayName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) return;

    setLoading(true);
    try {
      // 1. Enviamos solo la propiedad obligatoria que estamos actualizando
      // No arrastramos propiedades con valores null que romperían el schema de Zod
      await apiRequest("PUT", "/api/config", {
        businessName: businessName.trim(),
      });

      // 2. Actualizamos el display name global para que impacte en toda la UI
      const currentBranding = tenantBranding || {};
      await apiRequest("PUT", "/api/branding/tenant", {
        ...currentBranding,
        displayName: businessName.trim(),
      });

      await refreshBranding();
      setOpen(false);
      toast({ title: "Datos guardados", description: "¡Todo listo para empezar!" });
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // Si no está abierto o no es admin, no renderizamos nada
  if (!open || user?.role !== "admin") return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>¡Bienvenido a Orbia!</DialogTitle>
          <DialogDescription>
            Para terminar tu cuenta, ingresá cómo se llama tu negocio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="businessName">Nombre del negocio</Label>
            <Input
              id="businessName"
              placeholder="Ej: Kiosco Don Carlos"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <Button type="submit" className="w-full mt-4" disabled={loading || !businessName.trim()}>
            {loading ? "Guardando..." : "Comenzar a usar Orbia"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
