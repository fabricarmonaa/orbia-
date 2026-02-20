import { db } from "../db";
import { and, desc, eq } from "drizzle-orm";
import { plans, systemSettings, tenantSubscriptions, tenants, type InsertPlan } from "@shared/schema";

export const planStorage = {
  async getPlans() {
    return db.select().from(plans).where(eq(plans.isActive, true));
  },
  async getPlanById(id: number) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  },
  async createPlan(data: InsertPlan) {
    const [plan] = await db.insert(plans).values(data).returning();
    return plan;
  },

  async updatePlanByCode(planCode: string, data: Partial<InsertPlan>) {
    const [plan] = await db.update(plans).set({ ...data, updatedAt: new Date() } as any).where(eq(plans.planCode, planCode)).returning();
    return plan;
  },

  async listSubscriptions() {
    const rows = await db
      .select({
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantCode: tenants.code,
        planCode: tenantSubscriptions.planCode,
        status: tenantSubscriptions.status,
        startsAt: tenantSubscriptions.startsAt,
        expiresAt: tenantSubscriptions.expiresAt,
      })
      .from(tenants)
      .leftJoin(tenantSubscriptions, and(eq(tenantSubscriptions.tenantId, tenants.id), eq(tenantSubscriptions.status, "ACTIVE")))
      .orderBy(desc(tenants.createdAt));
    return rows;
  },

  async updateSubscription(tenantId: number, data: { planCode: string; status: string; startsAt?: Date | null; expiresAt?: Date | null }) {
    await db.update(tenantSubscriptions).set({ status: "EXPIRED", updatedAt: new Date() }).where(and(eq(tenantSubscriptions.tenantId, tenantId), eq(tenantSubscriptions.status, "ACTIVE")));
    const [sub] = await db.insert(tenantSubscriptions).values({
      tenantId,
      planCode: data.planCode,
      status: data.status,
      startsAt: data.startsAt || new Date(),
      expiresAt: data.expiresAt || null,
      updatedAt: new Date(),
    }).returning();
    return sub;
  },

  async getSystemSetting(key: string) {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return row;
  },

  async upsertSystemSetting(key: string, value: string) {
    const [row] = await db
      .insert(systemSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [systemSettings.key], set: { value, updatedAt: new Date() } })
      .returning();
    return row;
  },

};
