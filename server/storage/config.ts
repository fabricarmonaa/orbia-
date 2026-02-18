import { db } from "../db";
import { eq } from "drizzle-orm";
import { tenantConfig, superAdminConfig, type InsertTenantConfig, type InsertSuperAdminConfig } from "@shared/schema";

export const configStorage = {
  async getConfig(tenantId: number) {
    const [config] = await db.select().from(tenantConfig).where(eq(tenantConfig.tenantId, tenantId));
    return config;
  },
  async upsertConfig(data: InsertTenantConfig) {
    const [existing] = await db.select().from(tenantConfig).where(eq(tenantConfig.tenantId, data.tenantId));
    if (existing) {
      const [config] = await db
        .update(tenantConfig)
        .set(data)
        .where(eq(tenantConfig.tenantId, data.tenantId))
        .returning();
      return config;
    }
    const [config] = await db.insert(tenantConfig).values(data).returning();
    return config;
  },
  async getSuperAdminConfig(userId: number) {
    const [config] = await db.select().from(superAdminConfig).where(eq(superAdminConfig.userId, userId));
    return config;
  },
  async upsertSuperAdminConfig(data: InsertSuperAdminConfig) {
    const [existing] = await db.select().from(superAdminConfig).where(eq(superAdminConfig.userId, data.userId));
    if (existing) {
      const [updated] = await db.update(superAdminConfig).set(data).where(eq(superAdminConfig.userId, data.userId)).returning();
      return updated;
    }
    const [created] = await db.insert(superAdminConfig).values(data).returning();
    return created;
  },
};
