import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";

export const tenantBranding = pgTable(
  "tenant_branding",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull()
      .unique(),
    logoUrl: text("logo_url"),
    displayName: varchar("display_name", { length: 60 }),
    colorsJson: jsonb("colors_json").default({}),
    textsJson: jsonb("texts_json").default({}),
    linksJson: jsonb("links_json").default({}),
    pdfConfigJson: jsonb("pdf_config_json").default({}),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("idx_tenant_branding_tenant").on(table.tenantId)]
);

export const insertTenantBrandingSchema = createInsertSchema(tenantBranding).omit({
  id: true,
  updatedAt: true,
});
export type InsertTenantBranding = z.infer<typeof insertTenantBrandingSchema>;
export type TenantBranding = typeof tenantBranding.$inferSelect;

export const appBranding = pgTable("app_branding", {
  id: serial("id").primaryKey(),
  orbiaLogoUrl: text("orbia_logo_url"),
  orbiaName: varchar("orbia_name", { length: 120 }).default("Orbia"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAppBrandingSchema = createInsertSchema(appBranding).omit({
  id: true,
  updatedAt: true,
});
export type InsertAppBranding = z.infer<typeof insertAppBrandingSchema>;
export type AppBranding = typeof appBranding.$inferSelect;
