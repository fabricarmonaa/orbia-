import { pgTable, serial, integer, varchar, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { tenants } from "./tenants";

export const authLoginAttempts = pgTable(
  "auth_login_attempts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id),
    tenantCode: varchar("tenant_code", { length: 60 }),
    userId: integer("user_id").references(() => users.id),
    email: varchar("email", { length: 255 }),
    ip: varchar("ip", { length: 100 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
    failedCount: integer("failed_count").notNull().default(0),
    firstFailedAt: timestamp("first_failed_at"),
    lastFailedAt: timestamp("last_failed_at"),
    lockUntil: timestamp("lock_until"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_auth_login_attempts_fingerprint").on(table.fingerprint),
    index("idx_auth_login_attempts_fingerprint").on(table.fingerprint),
    index("idx_auth_login_attempts_lock_until").on(table.lockUntil),
  ]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id),
    userId: integer("user_id").references(() => users.id).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    revoked: boolean("revoked").notNull().default(false),
    requestedIp: varchar("requested_ip", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_password_reset_tokens_hash").on(table.tokenHash),
    index("idx_password_reset_tokens_user").on(table.userId, table.createdAt),
  ]
);
