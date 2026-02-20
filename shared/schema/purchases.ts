import { pgTable, serial, integer, varchar, timestamp, numeric, text, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { branches } from "./branches";
import { users } from "./users";
import { products } from "./products";

export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    branchId: integer("branch_id").references(() => branches.id),
    providerId: integer("provider_id"),
    providerName: varchar("provider_name", { length: 200 }),
    purchaseDate: timestamp("purchase_date").notNull().defaultNow(),
    currency: varchar("currency", { length: 10 }).notNull().default("ARS"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    importedByUserId: integer("imported_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("idx_purchases_tenant").on(table.tenantId)]
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: serial("id").primaryKey(),
    purchaseId: integer("purchase_id").references(() => purchases.id).notNull(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    branchId: integer("branch_id").references(() => branches.id),
    productId: integer("product_id").references(() => products.id).notNull(),
    productCodeSnapshot: varchar("product_code_snapshot", { length: 120 }),
    productNameSnapshot: varchar("product_name_snapshot", { length: 200 }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("ARS"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_purchase_items_purchase").on(table.purchaseId)]
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
    entity: varchar("entity", { length: 30 }).notNull(),
    fileName: varchar("file_name", { length: 255 }),
    processedRows: integer("processed_rows").notNull().default(0),
    successRows: integer("success_rows").notNull().default(0),
    errorRows: integer("error_rows").notNull().default(0),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_import_jobs_tenant").on(table.tenantId)]
);

export const insertPurchaseSchema = createInsertSchema(purchases).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPurchaseItemSchema = createInsertSchema(purchaseItems).omit({ id: true, createdAt: true });
export const insertImportJobSchema = createInsertSchema(importJobs).omit({ id: true, createdAt: true });

export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type Purchase = typeof purchases.$inferSelect;
export type PurchaseItem = typeof purchaseItems.$inferSelect;
