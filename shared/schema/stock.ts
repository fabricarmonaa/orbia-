import {
  pgTable,
  varchar,
  integer,
  timestamp,
  serial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { products } from "./products";
import { branches } from "./branches";
import { users } from "./users";

export const productStockByBranch = pgTable(
  "product_stock_by_branch",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id)
      .notNull(),
    branchId: integer("branch_id")
      .references(() => branches.id)
      .notNull(),
    stock: integer("stock").notNull().default(0),
  },
  (table) => [
    index("idx_stock_branch_tenant").on(table.tenantId),
    index("idx_stock_branch_product").on(table.productId),
    uniqueIndex("uq_stock_branch_product").on(table.tenantId, table.productId, table.branchId),
  ]
);

export const insertProductStockByBranchSchema = createInsertSchema(productStockByBranch).omit({
  id: true,
});
export type InsertProductStockByBranch = z.infer<typeof insertProductStockByBranchSchema>;
export type ProductStockByBranch = typeof productStockByBranch.$inferSelect;

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id)
      .notNull(),
    branchId: integer("branch_id").references(() => branches.id),
    quantity: integer("quantity").notNull(),
    reason: varchar("reason", { length: 200 }),
    userId: integer("user_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_stock_movements_tenant").on(table.tenantId)]
);

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({
  id: true,
  createdAt: true,
});
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;
