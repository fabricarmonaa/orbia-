import { pgTable, serial, integer, text, timestamp, index, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    requestedByIp: varchar("requested_by_ip", { length: 120 }),
    requestedByUserAgent: varchar("requested_by_user_agent", { length: 300 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_password_reset_tokens_user").on(table.userId),
    index("idx_password_reset_tokens_hash").on(table.tokenHash),
    index("idx_password_reset_tokens_expires").on(table.expiresAt),
  ]
);
