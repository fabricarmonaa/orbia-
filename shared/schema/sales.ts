import {
  pgTable,
  varchar,
  integer,
  timestamp,
  serial,
  numeric,
  index,
  uniqueIndex,
  text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { branches } from "./branches";
import { products } from "./products";
import { customers } from "./customers";

export const tenantCounters = pgTable(
  "tenant_counters",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    key: varchar("key", { length: 50 }).notNull(),
    value: integer("value").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("uq_tenant_counters_key").on(table.tenantId, table.key)]
);

export const sales = pgTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    branchId: integer("branch_id").references(() => branches.id, { onDelete: "set null" }),
    cashierUserId: integer("cashier_user_id"),
    saleNumber: varchar("sale_number", { length: 30 }).notNull(),
    saleDatetime: timestamp("sale_datetime").defaultNow().notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("ARS"),
    subtotalAmount: numeric("subtotal_amount", { precision: 12, scale: 2 }).notNull(),
    discountType: varchar("discount_type", { length: 20 }).notNull().default("NONE"),
    discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    surchargeType: varchar("surcharge_type", { length: 20 }).notNull().default("NONE"),
    surchargeValue: numeric("surcharge_value", { precision: 12, scale: 2 }).notNull().default("0"),
    surchargeAmount: numeric("surcharge_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 30 }).notNull(),
    notes: text("notes"),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    publicToken: varchar("public_token", { length: 120 }),
    publicTokenCreatedAt: timestamp("public_token_created_at"),
    publicTokenExpiresAt: timestamp("public_token_expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_sales_tenant").on(table.tenantId),
    index("idx_sales_tenant_created").on(table.tenantId, table.createdAt),
    index("idx_sales_tenant_date").on(table.tenantId, table.saleDatetime),
    index("idx_sales_tenant_branch_date").on(table.tenantId, table.branchId, table.saleDatetime),
    uniqueIndex("uq_sales_tenant_number").on(table.tenantId, table.saleNumber),
  ]
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id").references(() => sales.id).notNull(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    branchId: integer("branch_id").references(() => branches.id, { onDelete: "set null" }),
    productId: integer("product_id").references(() => products.id).notNull(),
    productNameSnapshot: varchar("product_name_snapshot", { length: 200 }).notNull(),
    skuSnapshot: varchar("sku_snapshot", { length: 100 }),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_sale_items_sale").on(table.saleId),
    index("idx_sale_items_sale_product").on(table.saleId, table.productId),
    index("idx_sale_items_tenant_product").on(table.tenantId, table.productId),
  ]
);

export const insertSaleSchema = createInsertSchema(sales).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof sales.$inferSelect;

export const insertSaleItemSchema = createInsertSchema(saleItems).omit({
  id: true,
  createdAt: true,
});
export type InsertSaleItem = z.infer<typeof insertSaleItemSchema>;
export type SaleItem = typeof saleItems.$inferSelect;
