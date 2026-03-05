import { pgTable, serial, integer, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const providers = pgTable(
    "providers",
    {
        id: serial("id").primaryKey(),
        tenantId: integer("tenant_id")
            .references(() => tenants.id, { onDelete: "cascade" })
            .notNull(),
        name: varchar("name", { length: 200 }).notNull(),
        address: text("address"),
        phone: varchar("phone", { length: 60 }),
        email: varchar("email", { length: 255 }),
        contactName: varchar("contact_name", { length: 200 }),
        notes: text("notes"),
        active: boolean("active").notNull().default(true),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => [
        index("idx_providers_tenant").on(table.tenantId),
        index("idx_providers_tenant_active").on(table.tenantId, table.active),
    ]
);

export const insertProviderSchema = createInsertSchema(providers).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providers.$inferSelect;
