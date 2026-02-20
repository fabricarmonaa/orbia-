import { pgTable, serial, integer, varchar, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { branches } from "./branches";

export const cashiers = pgTable(
  "cashiers",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    branchId: integer("branch_id").references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    pinHash: varchar("pin_hash", { length: 255 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_cashiers_tenant").on(table.tenantId),
    uniqueIndex("uq_cashiers_tenant_branch_name").on(table.tenantId, table.branchId, table.name),
  ]
);

export const insertCashierSchema = createInsertSchema(cashiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCashier = z.infer<typeof insertCashierSchema>;
export type Cashier = typeof cashiers.$inferSelect;
