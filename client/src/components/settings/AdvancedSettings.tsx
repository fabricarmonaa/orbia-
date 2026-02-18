import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users } from "lucide-react";
import { useLocation } from "wouter";
import { AuditLogList } from "./AuditLogList";

export function AdvancedSettings() {
  const [, setLocation] = useLocation();

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
            <h3 className="font-semibold">Usuarios / Sub-tenants</h3>
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
      <AuditLogList />
    </div>
  );
}
