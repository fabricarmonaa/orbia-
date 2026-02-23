import {
  pgTable,
  varchar,
  integer,
  timestamp,
  serial,
  index,
  uniqueIndex,
  numeric,
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

export const stockLevels = pgTable(
  "stock_levels",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    productId: integer("product_id").references(() => products.id).notNull(),
    branchId: integer("branch_id").references(() => branches.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("0"),
    averageCost: numeric("average_cost", { precision: 14, scale: 4 }).default("0"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_stock_levels_tenant_product_branch").on(table.tenantId, table.productId, table.branchId),
    index("idx_stock_levels_tenant_branch").on(table.tenantId, table.branchId),
  ]
);

export const insertStockLevelSchema = createInsertSchema(stockLevels).omit({ id: true, updatedAt: true });
export type InsertStockLevel = z.infer<typeof insertStockLevelSchema>;
export type StockLevel = typeof stockLevels.$inferSelect;

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
    movementType: varchar("movement_type", { length: 30 }).notNull().default("ADJUSTMENT_IN"),
    referenceId: integer("reference_id"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4 }),
    totalCost: numeric("total_cost", { precision: 14, scale: 2 }),
    note: varchar("note", { length: 250 }),
    reason: varchar("reason", { length: 200 }),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    userId: integer("user_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_stock_movements_tenant").on(table.tenantId), index("idx_stock_movements_kardex").on(table.tenantId, table.productId, table.branchId, table.createdAt)]
);

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({
  id: true,
  createdAt: true,
});
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;

export const stockTransfers = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  fromBranchId: integer("from_branch_id").references(() => branches.id),
  toBranchId: integer("to_branch_id").references(() => branches.id),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").references(() => stockTransfers.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
});

export type StockTransfer = typeof stockTransfers.$inferSelect;
export type StockTransferItem = typeof stockTransferItems.$inferSelect;
