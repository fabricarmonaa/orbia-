import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";

export type EntityType = "ORDER" | "PRODUCT" | "SALE";

export interface EntityField {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  sortOrder: number;
  isActive: boolean;
  config?: Record<string, unknown>;
}

export function useEntityFields(entityType: EntityType) {
  const [data, setData] = useState<EntityField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/fields/${entityType}`);
      const json = await res.json();
      setData(Array.isArray(json?.data) ? json.data : []);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar los campos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [entityType]);

  return { data, loading, error, reload, setData };
}
