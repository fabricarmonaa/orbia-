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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const productCategories = pgTable(
  "product_categories",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [index("idx_prod_cats_tenant").on(table.tenantId)]
);

export const insertProductCategorySchema = createInsertSchema(
  productCategories
).omit({ id: true });
export type InsertProductCategory = z.infer<
  typeof insertProductCategorySchema
>;
export type ProductCategory = typeof productCategories.$inferSelect;

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    categoryId: integer("category_id").references(() => productCategories.id),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    pricingMode: varchar("pricing_mode", { length: 20 }).notNull().default("MANUAL"),
    costAmount: numeric("cost_amount", { precision: 12, scale: 2 }),
    costCurrency: varchar("cost_currency", { length: 10 }),
    marginPct: numeric("margin_pct", { precision: 5, scale: 2 }),
    stock: integer("stock"),
    minStock: numeric("min_stock", { precision: 12, scale: 3 }).notNull().default("0"),
    sku: varchar("sku", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    statusCode: varchar("status_code", { length: 40 }).default("ACTIVE"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_products_tenant").on(table.tenantId),
    index("idx_products_tenant_active").on(table.tenantId, table.isActive, table.createdAt),
    index("idx_products_tenant_category_active_created").on(table.tenantId, table.categoryId, table.isActive, table.createdAt),
    uniqueIndex("uq_products_tenant_sku").on(table.tenantId, table.sku),
  ]
);

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
