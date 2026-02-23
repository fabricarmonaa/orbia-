import { pgTable, serial, integer, varchar, timestamp, index, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const tenantSubscriptions = pgTable(
  "tenant_subscriptions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    planCode: varchar("plan_code", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    startsAt: timestamp("starts_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_tenant_subscriptions_tenant").on(table.tenantId),
  ]
);

export const insertTenantSubscriptionSchema = createInsertSchema(tenantSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTenantSubscription = z.infer<typeof insertTenantSubscriptionSchema>;
export type TenantSubscription = typeof tenantSubscriptions.$inferSelect;

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, updatedAt: true });
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;
