import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { apiRequest } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { resolveAuditEvent } from "@/lib/audit-catalog";

interface AuditLog {
  id: number;
  action: string;
  entityType: string;
  entityId?: number | null;
  createdAt: string;
  user?: { fullName?: string | null; email?: string | null } | null;
}

export function AuditLogList() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("GET", "/api/audit?limit=50")
      .then((res) => res.json())
      .then((data) => setLogs(data.data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">Auditoría</h3>
        <p className="text-sm text-muted-foreground">Últimas acciones en el sistema</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin registros recientes</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div>
                  {(() => { const event = resolveAuditEvent(log.action, log.entityType); return (<>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{event.title}</p>
                    <Badge variant={event.severity === "error" ? "destructive" : "secondary"}>{event.severity}</Badge>
                    <Badge variant="outline">{event.category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{event.description}</p>
                  <p className="text-xs text-muted-foreground">{log.user?.fullName || "Sistema"}</p>
                  </>); })()}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString("es-AR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
