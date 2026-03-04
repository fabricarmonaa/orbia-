import { pgTable, serial, integer, varchar, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { branches } from "./branches";

export const userBranches = pgTable(
  "user_branches",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    branchId: integer("branch_id").references(() => branches.id, { onDelete: "cascade" }).notNull(),
    roleInBranch: varchar("role_in_branch", { length: 30 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_user_branches_tenant_user_branch").on(table.tenantId, table.userId, table.branchId),
    index("idx_user_branches_tenant_branch").on(table.tenantId, table.branchId),
    index("idx_user_branches_tenant_user").on(table.tenantId, table.userId),
  ]
);

export type UserBranch = typeof userBranches.$inferSelect;
