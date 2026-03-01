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
  uniqueIndex,
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
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
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

export const sttInteractions = pgTable(
  "stt_interactions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    transcript: text("transcript").notNull(),
    intentConfirmed: varchar("intent_confirmed", { length: 80 }).notNull(),
    entitiesConfirmed: jsonb("entities_confirmed").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    errorCode: varchar("error_code", { length: 80 }),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_stt_interactions_tenant").on(table.tenantId),
    index("idx_stt_interactions_tenant_user").on(table.tenantId, table.userId),
    uniqueIndex("uq_stt_interactions_tenant_user_idempotency").on(table.tenantId, table.userId, table.idempotencyKey),
  ]
);

export const insertSttInteractionSchema = createInsertSchema(sttInteractions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSttInteraction = z.infer<typeof insertSttInteractionSchema>;
export type SttInteraction = typeof sttInteractions.$inferSelect;
