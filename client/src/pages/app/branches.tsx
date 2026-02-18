import { useState, useEffect } from "react";
import { apiRequest, useAuth } from "@/lib/auth";
import { usePlan } from "@/lib/plan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Building2, MapPin, Phone, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Branch } from "@shared/schema";

export default function BranchesPage() {
  const { hasFeature, getLimit, plan, loading: planLoading } = usePlan();
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isTenantAdmin = user?.role === "admin";

  const [newBranch, setNewBranch] = useState({
    name: "",
    address: "",
    phone: "",
  });

  const canAccess = hasFeature("branches");
  const maxBranches = getLimit("max_branches");

  useEffect(() => {
    if (!isTenantAdmin) {
      setLocation("/app");
      return;
    }
    if (!canAccess) {
      toast({ title: "Plan requerido", description: "Esta función está disponible solo en el plan Escala.", variant: "destructive" });
      setLocation("/app/settings");
      return;
    }
    fetchData();
  }, [canAccess, isTenantAdmin, setLocation, toast]);

  async function fetchData() {
    try {
      const res = await apiRequest("GET", "/api/branches");
      const data = await res.json();
      setBranches(data.data || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function createBranch(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("POST", "/api/branches", newBranch);
      toast({ title: "Sucursal creada" });
      setDialogOpen(false);
      setNewBranch({ name: "", address: "", phone: "" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  if (!isTenantAdmin) {
    return null;
  }

  if (planLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }


  const atLimit = maxBranches >= 0 && branches.length >= maxBranches;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sucursales</h1>
          <p className="text-muted-foreground">
            Gestión de sedes y puntos de atención
            {maxBranches >= 0 && (
              <span className="ml-2 text-xs">
                ({branches.length}/{maxBranches} usadas)
              </span>
            )}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              data-testid="button-create-branch"
              disabled={atLimit}
              title={atLimit ? `Tu plan permite máximo ${maxBranches} sucursales` : undefined}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Sucursal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva Sucursal</DialogTitle>
            </DialogHeader>
            <form onSubmit={createBranch} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  placeholder="Nombre de la sucursal"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  required
                  data-testid="input-branch-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input
                  placeholder="Dirección"
                  value={newBranch.address}
                  onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                  data-testid="input-branch-address"
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  placeholder="Teléfono"
                  value={newBranch.phone}
                  onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                  data-testid="input-branch-phone"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-submit-branch">
                Crear Sucursal
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {atLimit && (
        <Card className="border-chart-4/30">
          <CardContent className="py-3">
            <p className="text-sm text-muted-foreground">
              Alcanzaste el límite de <strong>{maxBranches}</strong> sucursales de tu plan{" "}
              <Badge variant="secondary">{plan?.name}</Badge>. Mejorá tu plan para agregar más.
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-md" />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-medium">No hay sucursales</p>
            <p className="text-sm text-muted-foreground mt-1">Creá tu primera sucursal</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((branch) => (
            <Card
              key={branch.id}
              className="hover-elevate cursor-pointer"
              data-testid={`card-branch-${branch.id}`}
              onClick={() => setLocation(`/app/branches/${branch.id}`)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-md bg-primary/10 flex-shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{branch.name}</p>
                      <Badge variant={branch.isActive ? "default" : "secondary"}>
                        {branch.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                    {branch.address && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <p className="text-sm text-muted-foreground truncate">{branch.address}</p>
                      </div>
                    )}
                    {branch.phone && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Phone className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <p className="text-sm text-muted-foreground">{branch.phone}</p>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
