import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";
import type { EntityType } from "./use-entity-fields";

export function useVisibilitySettings(entityType: EntityType) {
  const [data, setData] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/visibility/${entityType}`);
      const json = await res.json();
      setData((json?.data || {}) as Record<string, boolean>);
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar visibilidad.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [entityType]);

  return { data, setData, loading, error, reload };
}
