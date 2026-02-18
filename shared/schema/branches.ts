import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const branches = pgTable(
  "branches",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    address: text("address"),
    phone: varchar("phone", { length: 50 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("idx_branches_tenant").on(table.tenantId),
    index("idx_branches_tenant_deleted_at").on(table.tenantId, table.deletedAt),
  ]
);

export const insertBranchSchema = createInsertSchema(branches).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type Branch = typeof branches.$inferSelect;
