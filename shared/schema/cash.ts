import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  serial,
  numeric,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { branches } from "./branches";
import { users } from "./users";
import { orders } from "./orders";

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    branchId: integer("branch_id").references(() => branches.id),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    openingAmount: numeric("opening_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    closingAmount: numeric("closing_amount", { precision: 12, scale: 2 }),
    difference: numeric("difference", { precision: 12, scale: 2 }),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    openedAt: timestamp("opened_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
  },
  (table) => [
    index("idx_cash_sessions_tenant").on(table.tenantId),
    index("idx_cash_sessions_tenant_created_session").on(table.tenantId, table.openedAt, table.id),
  ]
);

export const insertCashSessionSchema = createInsertSchema(cashSessions).omit({
  id: true,
  openedAt: true,
});
export type InsertCashSession = z.infer<typeof insertCashSessionSchema>;
export type CashSession = typeof cashSessions.$inferSelect;

export const expenseDefinitions = pgTable(
  "expense_definitions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    defaultAmount: numeric("default_amount", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 10 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_expense_defs_tenant").on(table.tenantId),
    index("idx_expense_defs_tenant_type").on(table.tenantId, table.type),
  ]
);

export const insertExpenseDefinitionSchema = createInsertSchema(expenseDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertExpenseDefinition = z.infer<typeof insertExpenseDefinitionSchema>;
export type ExpenseDefinition = typeof expenseDefinitions.$inferSelect;

export const tenantMonthlySummaries = pgTable(
  "tenant_monthly_summaries",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    totalsJson: jsonb("totals_json").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_monthly_summaries_tenant").on(table.tenantId),
    index("idx_monthly_summaries_period").on(table.tenantId, table.year, table.month),
  ]
);

export const insertTenantMonthlySummarySchema = z.object({
  tenantId: z.number().int(),
  year: z.number().int(),
  month: z.number().int(),
  totalsJson: z.any(),
});
export type InsertTenantMonthlySummary = z.infer<typeof insertTenantMonthlySummarySchema>;
export type TenantMonthlySummary = typeof tenantMonthlySummaries.$inferSelect;

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    sessionId: integer("session_id").references(() => cashSessions.id),
    branchId: integer("branch_id").references(() => branches.id),
    type: varchar("type", { length: 20 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    method: varchar("method", { length: 50 }).default("efectivo"),
    category: varchar("category", { length: 100 }),
    description: text("description"),
    expenseDefinitionId: integer("expense_definition_id").references(() => expenseDefinitions.id),
    expenseDefinitionName: varchar("expense_definition_name", { length: 200 }),
    orderId: integer("order_id").references(() => orders.id),
    createdById: integer("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_cash_movements_tenant").on(table.tenantId),
    index("idx_cash_movements_tenant_created_session").on(table.tenantId, table.createdAt, table.sessionId),
  ]
);

export const insertCashMovementSchema = createInsertSchema(cashMovements).omit({
  id: true,
  createdAt: true,
});
export type InsertCashMovement = z.infer<typeof insertCashMovementSchema>;
export type CashMovement = typeof cashMovements.$inferSelect;

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("variable"),
  },
  (table) => [index("idx_expense_cats_tenant").on(table.tenantId)]
);

export const insertExpenseCategorySchema = createInsertSchema(
  expenseCategories
).omit({ id: true });
export type InsertExpenseCategory = z.infer<
  typeof insertExpenseCategorySchema
>;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;

export const fixedExpenses = pgTable(
  "fixed_expenses",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    categoryId: integer("category_id").references(() => expenseCategories.id),
    name: varchar("name", { length: 200 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    periodicity: varchar("periodicity", { length: 20 }).default("monthly"),
    payDay: integer("pay_day"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [index("idx_fixed_expenses_tenant").on(table.tenantId)]
);

export const insertFixedExpenseSchema = createInsertSchema(fixedExpenses).omit({
  id: true,
});
export type InsertFixedExpense = z.infer<typeof insertFixedExpenseSchema>;
export type FixedExpense = typeof fixedExpenses.$inferSelect;
