import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/auth";

export interface TenantLimitsResponse {
  planCode: string;
  planName: string;
  limits: {
    maxCashiers: number;
    maxBranches: number;
  };
  usage: {
    cashiersCount: number;
    branchesCount: number;
  };
}

export function useTenantLimits() {
  const [data, setData] = useState<TenantLimitsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest("GET", "/api/tenant/limits")
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        setData(json?.data || null);
      })
      .catch(() => {
        if (!active) return;
        setData(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { data, loading };
}
