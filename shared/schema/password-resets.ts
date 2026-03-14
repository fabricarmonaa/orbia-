import { pgTable, serial, integer, text, timestamp, index, varchar, boolean } from "drizzle-orm/pg-core";
import { users } from "./users";
import { tenants } from "./tenants";

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    revoked: boolean("revoked").notNull().default(false),
    requestedByIp: varchar("requested_by_ip", { length: 100 }),
    requestedByUserAgent: varchar("requested_by_user_agent", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_password_reset_tokens_user").on(table.userId),
    index("idx_password_reset_tokens_hash").on(table.tokenHash),
    index("idx_password_reset_tokens_expires").on(table.expiresAt),
    index("idx_password_reset_tokens_tenant").on(table.tenantId),
  ]
);
