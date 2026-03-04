import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AuditItem {
  id: number;
  createdAt: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorRole: string;
  actorUser?: { fullName?: string | null; email?: string | null } | null;
  actorCashier?: { name?: string | null } | null;
  summary: string;
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");

  async function load() {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("page", "1");
      q.set("pageSize", "50");
      if (action.trim()) q.set("action", action.trim());
      const res = await apiRequest("GET", `/api/audit?${q.toString()}`);
      const json = await res.json();
      setItems(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoría</h1>
        <p className="text-muted-foreground">Trazabilidad de acciones sensibles por tenant.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filtrar por acción (ej: cajero.crear)" />
          <Button onClick={() => void load()}>Filtrar</Button>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Cargando eventos...</p> : null}
          {!loading && items.length === 0 ? <p className="text-sm text-muted-foreground">No hay eventos para mostrar.</p> : null}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <p className="text-sm font-semibold">{item.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString("es-AR")} · Actor: {item.actorUser?.fullName || item.actorCashier?.name || item.actorRole}
                </p>
                <p className="text-xs text-muted-foreground">Entidad: {item.entityType} {item.entityId ? `#${item.entityId}` : ""}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
