import { useState, useEffect, useCallback } from "react";
import { apiRequest, getToken } from "@/lib/auth";

export interface PlanFeatures {
  // Use string index signature for dynamic feature keys from the DB
  [key: string]: boolean;
}

export interface PlanLimits {
  [key: string]: number;
}

export interface PlanInfo {
  planCode: string;
  name: string;
  description?: string | null;
  priceMonthly?: string | number | null;
  currency?: string | null;
  features: PlanFeatures;
  limits: PlanLimits;
}

let cachedPlan: PlanInfo | null = null;
let planLoaded = false;
const planListeners = new Set<() => void>();

function notifyPlanListeners() {
  planListeners.forEach((l) => l());
}

export function clearPlanCache() {
  cachedPlan = null;
  planLoaded = false;
  notifyPlanListeners();
}

export async function fetchPlan(): Promise<PlanInfo | null> {
  try {
    const token = getToken();
    if (!token) return null;
    const res = await apiRequest("GET", "/api/me/plan");
    const data = await res.json();
    cachedPlan = data.data || null;
    planLoaded = true;
    notifyPlanListeners();
    return cachedPlan;
  } catch {
    cachedPlan = null;
    planLoaded = true;
    notifyPlanListeners();
    return null;
  }
}

export function usePlan() {
  const [plan, setPlan] = useState<PlanInfo | null>(cachedPlan);
  const [loading, setLoading] = useState(!planLoaded);

  useEffect(() => {
    const listener = () => {
      setPlan(cachedPlan);
      setLoading(!planLoaded);
    };
    planListeners.add(listener);

    if (!planLoaded) {
      fetchPlan().then(() => {
        setPlan(cachedPlan);
        setLoading(false);
      });
    }

    return () => { planListeners.delete(listener); };
  }, []);

  /**
   * Check if a plan feature is enabled.
   * All feature checking goes through featuresJson from the DB — no hardcoded plan codes.
   * Feature keys are canonical strings defined in shared/plan-features.ts.
   */
  const hasFeature = useCallback((feature: string): boolean => {
    if (!plan) return false;
    return plan.features[feature] === true;
  }, [plan]);

  /**
   * Get a numeric limit value. Returns -1 (unlimited) if the key is absent.
   */
  const getLimit = useCallback((limit: string): number => {
    if (!plan) return 0;
    return plan.limits[limit] ?? -1;
  }, [plan]);

  return { plan, loading, hasFeature, getLimit };
}
