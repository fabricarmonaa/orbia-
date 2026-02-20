import { useState, useEffect, useCallback } from "react";
import { apiRequest, getToken } from "@/lib/auth";

export interface PlanFeatures {
  orders: boolean;
  tracking: boolean;
  cash_simple: boolean;
  cash_sessions: boolean;
  products: boolean;
  branches: boolean;
  fixed_expenses: boolean;
  variable_expenses: boolean;
  reports_advanced: boolean;
  stt: boolean;
  [key: string]: boolean;
}

export interface PlanLimits {
  max_branches: number;
  max_staff_users: number;
  max_orders_month: number;
  tracking_retention_min_hours: number;
  tracking_retention_max_hours: number;
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

  const hasFeature = useCallback((feature: string): boolean => {
    if (!plan) return false;
    const code = (plan.planCode || "").toUpperCase();
    if (feature === "branches") return code === "ESCALA";
    if (feature === "stt") return code === "ESCALA";
    return plan.features[feature] === true;
  }, [plan]);

  const getLimit = useCallback((limit: string): number => {
    if (!plan) return 0;
    return plan.limits[limit] ?? 0;
  }, [plan]);

  return { plan, loading, hasFeature, getLimit };
}
