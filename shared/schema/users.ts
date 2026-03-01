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

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    password: text("password").notNull(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("staff"),
    scope: varchar("scope", { length: 20 }).notNull().default("TENANT"),
    branchId: integer("branch_id"),
    isActive: boolean("is_active").notNull().default(true),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    avatarUrl: text("avatar_url"),
    avatarUpdatedAt: timestamp("avatar_updated_at"),
    tokenInvalidBefore: timestamp("token_invalid_before"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("idx_users_tenant").on(table.tenantId),
    index("idx_users_tenant_deleted_at").on(table.tenantId, table.deletedAt),
  ]
);

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
