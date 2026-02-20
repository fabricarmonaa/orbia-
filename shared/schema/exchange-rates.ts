import { pgTable, serial, integer, varchar, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id),
    baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
    targetCurrency: varchar("target_currency", { length: 10 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_exchange_rates_tenant").on(table.tenantId),
    uniqueIndex("uq_exchange_rates_pair").on(table.tenantId, table.baseCurrency, table.targetCurrency),
  ]
);

export const insertExchangeRateSchema = createInsertSchema(exchangeRates).omit({
  id: true,
  updatedAt: true,
});

export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
