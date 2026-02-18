import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { users } from "./users";

export const sttLogs = pgTable(
  "stt_logs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    userId: integer("user_id").references(() => users.id),
    context: varchar("context", { length: 50 }).notNull(),
    transcription: text("transcription"),
    intentJson: jsonb("intent_json"),
    confirmed: boolean("confirmed").default(false),
    resultEntityType: varchar("result_entity_type", { length: 50 }),
    resultEntityId: integer("result_entity_id"),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_stt_logs_tenant").on(table.tenantId)]
);

export const insertSttLogSchema = createInsertSchema(sttLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertSttLog = z.infer<typeof insertSttLogSchema>;
export type SttLog = typeof sttLogs.$inferSelect;
