import { getTenantPlan } from "../auth";
import { storage } from "../storage";

export function getPlanDefaultTrackingHours(planCode: string | null | undefined) {
  const code = String(planCode || "").toUpperCase();
  if (code === "ESCALA") return 720;
  if (code === "PROFESIONAL") return 128;
  return 24;
}

export function resolveTrackingHours(rawHours: unknown, planCode: string | null | undefined) {
  const fallback = getPlanDefaultTrackingHours(planCode);
  const parsed = Number(rawHours);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export async function getTenantEffectiveTrackingHours(tenantId: number) {
  const [plan, config] = await Promise.all([
    getTenantPlan(tenantId),
    storage.getConfig(tenantId),
  ]);
  return resolveTrackingHours(config?.trackingExpirationHours, plan?.planCode);
}
