import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";

export interface OptionListItem {
  id: number;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export interface OptionList {
  id: number;
  key: string;
  name: string;
  entityScope?: string | null;
  items?: OptionListItem[];
}

export function useOptionLists() {
  const [data, setData] = useState<OptionList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("GET", "/api/option-lists");
      const json = await res.json();
      setData(Array.isArray(json?.data) ? json.data : []);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar las listas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  return { data, setData, loading, error, reload };
}
