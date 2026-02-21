import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { tenants, tenantAddons, type InsertTenant, type InsertTenantAddon } from "@shared/schema";

export const tenantStorage = {
  async getTenants() {
    return db.select().from(tenants).orderBy(desc(tenants.createdAt));
  },
  async getTenantById(id: number) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  },
  async getTenantByCode(code: string) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.code, code));
    return tenant;
  },
  async createTenant(data: InsertTenant) {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  },
  async updateTenantPlan(tenantId: number, planId: number) {
    await db.update(tenants).set({ planId }).where(eq(tenants.id, tenantId));
  },
  async updateTenantSubscription(tenantId: number, startDate: Date, endDate: Date) {
    await db.update(tenants).set({ subscriptionStartDate: startDate, subscriptionEndDate: endDate }).where(eq(tenants.id, tenantId));
  },
  async updateTenantActive(tenantId: number, isActive: boolean) {
    await db.update(tenants).set({ isActive }).where(eq(tenants.id, tenantId));
  },
  async updateTenantBlocked(tenantId: number, isBlocked: boolean) {
    await db.update(tenants).set({ isBlocked }).where(eq(tenants.id, tenantId));
  },
  async updateTenantName(tenantId: number, name: string) {
    await db.update(tenants).set({ name }).where(eq(tenants.id, tenantId));
  },
  async softDeleteTenant(tenantId: number) {
    await db.update(tenants).set({ deletedAt: new Date(), isBlocked: true }).where(eq(tenants.id, tenantId));
  },
  async getTenantAddon(tenantId: number, addonKey: string) {
    const [addon] = await db
      .select()
      .from(tenantAddons)
      .where(and(eq(tenantAddons.tenantId, tenantId), eq(tenantAddons.addonKey, addonKey)));
    return addon;
  },
  async getTenantAddons(tenantId: number) {
    return db.select().from(tenantAddons).where(eq(tenantAddons.tenantId, tenantId));
  },
  async upsertTenantAddon(data: InsertTenantAddon) {
    const [existing] = await db
      .select()
      .from(tenantAddons)
      .where(and(eq(tenantAddons.tenantId, data.tenantId), eq(tenantAddons.addonKey, data.addonKey)));
    if (existing) {
      const [addon] = await db
        .update(tenantAddons)
        .set({ enabled: data.enabled, enabledById: data.enabledById, enabledAt: data.enabledAt, updatedAt: new Date() })
        .where(eq(tenantAddons.id, existing.id))
        .returning();
      return addon;
    }
    const [addon] = await db.insert(tenantAddons).values({ ...data, updatedAt: new Date() }).returning();
    return addon;
  },
};
