import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, MessageCircle, Truck, Users } from "lucide-react";
import { useLocation } from "wouter";
import { AuditLogList } from "./AuditLogList";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";

export function AdvancedSettings() {
  const [, setLocation] = useLocation();
  const [selectedAddon, setSelectedAddon] = useState("delivery");
  const [addonStatus, setAddonStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    apiRequest("GET", "/api/addons/status")
      .then((r) => r.json())
      .then((d) => setAddonStatus(d.data || {}))
      .catch(() => {});
  }, []);

  const addonMeta: Record<string, { label: string; route: string; icon: any }> = {
    delivery: { label: "Delivery", route: "/app/delivery", icon: Truck },
    messaging_whatsapp: { label: "Mensajería (WhatsApp)", route: "/app/messaging", icon: MessageCircle },
  };

  const current = addonMeta[selectedAddon];
  const isActive = !!addonStatus[selectedAddon];
  const Icon = current?.icon || Truck;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Sucursales</h3>
            <p className="text-sm text-muted-foreground">Administración y acciones avanzadas</p>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setLocation("/app/branches")}>
              <Building2 className="w-4 h-4 mr-2" />
              Gestionar sucursales
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Usuarios de sucursales</h3>
            <p className="text-sm text-muted-foreground">Gestiona usuarios por sucursal</p>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setLocation("/app/branches")}>
              <Users className="w-4 h-4 mr-2" />
              Administrar usuarios
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-semibold">Addons</h3>
          <p className="text-sm text-muted-foreground">Seleccioná un addon para configurarlo</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedAddon} onValueChange={setSelectedAddon}>
            <SelectTrigger className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="messaging_whatsapp">Mensajería (WhatsApp)</SelectItem>
            </SelectContent>
          </Select>

          <div className="rounded-md border p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4" />
              <div>
                <p className="font-medium">{current?.label}</p>
                <p className="text-sm text-muted-foreground">Estado: {isActive ? "Activo" : "Inactivo"}</p>
              </div>
            </div>
            {isActive ? (
              <Button onClick={() => setLocation(current.route)}>Configurar</Button>
            ) : (
              <p className="text-sm text-muted-foreground">No disponible en tu plan / contactá admin</p>
            )}
          </div>
        </CardContent>
      </Card>

      <AuditLogList />
    </div>
  );
}
