import { pgTable, serial, varchar, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const businessTemplates = pgTable(
  "business_templates",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("uq_business_templates_code").on(table.code)]
);

export type BusinessTemplate = typeof businessTemplates.$inferSelect;
