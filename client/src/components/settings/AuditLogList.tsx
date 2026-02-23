import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { apiRequest } from "@/lib/auth";

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
                  <p className="text-sm font-medium">
                    {log.action} · {log.entityType} {log.entityId ? `#${log.entityId}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {log.user?.fullName || log.user?.email || "Sistema"}
                  </p>
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
