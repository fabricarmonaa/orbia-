import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { users } from "./users";

export const tenantConfig = pgTable("tenant_config", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id)
    .notNull()
    .unique(),
  businessName: varchar("business_name", { length: 200 }),
  businessType: varchar("business_type", { length: 100 }),
  businessDescription: text("business_description"),
  logoUrl: text("logo_url"),
  currency: varchar("currency", { length: 10 }).default("ARS"),
  trackingExpirationHours: integer("tracking_expiration_hours").default(24),
  language: varchar("language", { length: 10 }).default("es"),
  trackingLayout: varchar("tracking_layout", { length: 50 }).default("classic"),
  trackingPrimaryColor: varchar("tracking_primary_color", { length: 20 }).default("#6366f1"),
  trackingAccentColor: varchar("tracking_accent_color", { length: 20 }).default("#8b5cf6"),
  trackingBgColor: varchar("tracking_bg_color", { length: 20 }).default("#ffffff"),
  trackingTosText: text("tracking_tos_text"),
  configJson: jsonb("config_json").default({}),
});

export const insertTenantConfigSchema = createInsertSchema(tenantConfig).omit({
  id: true,
});
export type InsertTenantConfig = z.infer<typeof insertTenantConfigSchema>;
export type TenantConfig = typeof tenantConfig.$inferSelect;

export const superAdminConfig = pgTable("super_admin_config", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  avatarUrl: text("avatar_url"),
  brandName: varchar("brand_name", { length: 200 }).default("ORBIA"),
  configJson: jsonb("config_json").default({}),
});

export const insertSuperAdminConfigSchema = createInsertSchema(superAdminConfig).omit({
  id: true,
});
export type InsertSuperAdminConfig = z.infer<typeof insertSuperAdminConfigSchema>;
export type SuperAdminConfig = typeof superAdminConfig.$inferSelect;
