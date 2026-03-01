import {
  pgTable,
  serial,
  integer,
  date,
  timestamp,
  numeric,
  varchar,
  text,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { users } from "./users";

export const tenantDailyMetrics = pgTable(
  "tenant_daily_metrics",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    day: date("day").notNull(),
    ordersCount: integer("orders_count").notNull().default(0),
    revenueTotal: numeric("revenue_total", { precision: 14, scale: 2 }).notNull().default("0"),
    ordersCancelledCount: integer("orders_cancelled_count").notNull().default(0),
    cashInTotal: numeric("cash_in_total", { precision: 14, scale: 2 }).notNull().default("0"),
    cashOutTotal: numeric("cash_out_total", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_tenant_daily_metrics_day").on(table.tenantId, table.day),
    index("idx_tenant_daily_metrics_tenant_day").on(table.tenantId, table.day),
  ]
);

export const tenantMonthlyMetrics = pgTable(
  "tenant_monthly_metrics",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    month: date("month").notNull(),
    ordersCount: integer("orders_count").notNull().default(0),
    revenueTotal: numeric("revenue_total", { precision: 14, scale: 2 }).notNull().default("0"),
    ordersCancelledCount: integer("orders_cancelled_count").notNull().default(0),
    cashInTotal: numeric("cash_in_total", { precision: 14, scale: 2 }).notNull().default("0"),
    cashOutTotal: numeric("cash_out_total", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_tenant_monthly_metrics_month" ).on(table.tenantId, table.month),
    index("idx_tenant_monthly_metrics_tenant_month").on(table.tenantId, table.month),
  ]
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    key: varchar("idempotency_key", { length: 120 }).notNull(),
    route: varchar("route", { length: 120 }).notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_idempotency_tenant_user_key_route").on(table.tenantId, table.userId, table.key, table.route),
    index("idx_idempotency_tenant_created").on(table.tenantId, table.createdAt),
  ]
);

export const insertTenantDailyMetricsSchema = createInsertSchema(tenantDailyMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantDailyMetrics = z.infer<typeof insertTenantDailyMetricsSchema>;
export type TenantDailyMetrics = typeof tenantDailyMetrics.$inferSelect;

export const insertTenantMonthlyMetricsSchema = createInsertSchema(tenantMonthlyMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantMonthlyMetrics = z.infer<typeof insertTenantMonthlyMetricsSchema>;
export type TenantMonthlyMetrics = typeof tenantMonthlyMetrics.$inferSelect;

export const insertIdempotencyKeySchema = createInsertSchema(idempotencyKeys).omit({ id: true, createdAt: true });
export type InsertIdempotencyKey = z.infer<typeof insertIdempotencyKeySchema>;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
