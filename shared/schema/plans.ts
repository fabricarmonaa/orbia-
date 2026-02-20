import {
  pgTable,
  varchar,
  boolean,
  jsonb,
  serial,
  numeric,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  planCode: varchar("plan_code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }),
  featuresJson: jsonb("features_json").notNull().default({}),
  limitsJson: jsonb("limits_json").notNull().default({}),
  priceMonthly: numeric("price_monthly", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("ARS"),
  maxBranches: integer("max_branches").default(1),
  allowCashiers: boolean("allow_cashiers").notNull().default(false),
  allowMarginPricing: boolean("allow_margin_pricing").notNull().default(false),
  allowExcelImport: boolean("allow_excel_import").notNull().default(false),
  allowCustomTos: boolean("allow_custom_tos").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlanSchema = createInsertSchema(plans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;
