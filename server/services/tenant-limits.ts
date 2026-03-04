import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { cashiers, branches } from "@shared/schema";
import { getTenantPlan } from "../auth";

export interface TenantLimitsSnapshot {
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

export async function getTenantLimitsSnapshot(tenantId: number): Promise<TenantLimitsSnapshot | null> {
  const plan = await getTenantPlan(tenantId);
  if (!plan) return null;

  const [cashiersRow] = await db
    .select({ c: count() })
    .from(cashiers)
    .where(and(eq(cashiers.tenantId, tenantId), eq(cashiers.active, true)));

  const [branchesRow] = await db
    .select({ c: count() })
    .from(branches)
    .where(and(eq(branches.tenantId, tenantId), isNull(branches.deletedAt)));

  return {
    planCode: plan.planCode,
    planName: plan.name,
    limits: {
      maxCashiers: Number(plan.limits.cashiers_max ?? 0),
      maxBranches: Number(plan.limits.branches_max ?? plan.limits.max_branches ?? 0),
    },
    usage: {
      cashiersCount: Number(cashiersRow?.c || 0),
      branchesCount: Number(branchesRow?.c || 0),
    },
  };
}
