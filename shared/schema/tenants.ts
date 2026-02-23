import {
  pgTable,
  varchar,
  integer,
  boolean,
  timestamp,
  serial,
  text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { plans } from "./plans";

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  tosContent: text("tos_content"),
  tosUpdatedAt: timestamp("tos_updated_at"),
  planId: integer("plan_id").references(() => plans.id),
  isActive: boolean("is_active").notNull().default(true),
  isBlocked: boolean("is_blocked").notNull().default(false),
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
});
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;
