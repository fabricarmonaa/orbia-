import {
  pgTable,
  varchar,
  boolean,
  jsonb,
  serial,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  planCode: varchar("plan_code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  featuresJson: jsonb("features_json").notNull().default({}),
  limitsJson: jsonb("limits_json").notNull().default({}),
  priceMonthly: numeric("price_monthly", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertPlanSchema = createInsertSchema(plans).omit({ id: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;
