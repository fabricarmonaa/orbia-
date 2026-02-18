import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  serial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { users } from "./users";
import { orders } from "./orders";
import { orderStatuses } from "./orders";

export const tenantAddons = pgTable(
  "tenant_addons",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    addonKey: varchar("addon_key", { length: 50 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    enabledById: integer("enabled_by_id").references(() => users.id),
    enabledAt: timestamp("enabled_at"),
  },
  (table) => [
    index("idx_tenant_addons_tenant").on(table.tenantId),
    uniqueIndex("uq_tenant_addons_key").on(table.tenantId, table.addonKey),
  ]
);

export const insertTenantAddonSchema = createInsertSchema(tenantAddons).omit({
  id: true,
});
export type InsertTenantAddon = z.infer<typeof insertTenantAddonSchema>;
export type TenantAddon = typeof tenantAddons.$inferSelect;

export const deliveryAgents = pgTable(
  "delivery_agents",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    dni: varchar("dni", { length: 20 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull(),
    pinHash: text("pin_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_delivery_agents_tenant").on(table.tenantId),
    uniqueIndex("uq_delivery_agents_dni").on(table.tenantId, table.dni),
  ]
);

export const insertDeliveryAgentSchema = createInsertSchema(deliveryAgents).omit({
  id: true,
  createdAt: true,
});
export type InsertDeliveryAgent = z.infer<typeof insertDeliveryAgentSchema>;
export type DeliveryAgent = typeof deliveryAgents.$inferSelect;

export const deliveryActionStates = pgTable(
  "delivery_action_states",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    requiresPhoto: boolean("requires_photo").notNull().default(true),
    requiresComment: boolean("requires_comment").notNull().default(false),
    nextOrderStatusId: integer("next_order_status_id").references(() => orderStatuses.id),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [index("idx_delivery_action_states_tenant").on(table.tenantId)]
);

export const insertDeliveryActionStateSchema = createInsertSchema(deliveryActionStates).omit({
  id: true,
});
export type InsertDeliveryActionState = z.infer<typeof insertDeliveryActionStateSchema>;
export type DeliveryActionState = typeof deliveryActionStates.$inferSelect;

export const deliveryRoutes = pgTable(
  "delivery_routes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    agentId: integer("agent_id")
      .references(() => deliveryAgents.id)
      .notNull(),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    originAddress: text("origin_address"),
    directionsUrl: text("directions_url"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [index("idx_delivery_routes_tenant").on(table.tenantId)]
);

export const insertDeliveryRouteSchema = createInsertSchema(deliveryRoutes).omit({
  id: true,
  startedAt: true,
});
export type InsertDeliveryRoute = z.infer<typeof insertDeliveryRouteSchema>;
export type DeliveryRoute = typeof deliveryRoutes.$inferSelect;

export const deliveryRouteStops = pgTable(
  "delivery_route_stops",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id")
      .references(() => deliveryRoutes.id)
      .notNull(),
    orderId: integer("order_id")
      .references(() => orders.id)
      .notNull(),
    stopOrder: integer("stop_order").notNull(),
    actionStateId: integer("action_state_id").references(() => deliveryActionStates.id),
    actionAt: timestamp("action_at"),
  },
  (table) => [index("idx_delivery_route_stops_route").on(table.routeId)]
);

export const insertDeliveryRouteStopSchema = createInsertSchema(deliveryRouteStops).omit({
  id: true,
});
export type InsertDeliveryRouteStop = z.infer<typeof insertDeliveryRouteStopSchema>;
export type DeliveryRouteStop = typeof deliveryRouteStops.$inferSelect;

export const deliveryProofs = pgTable(
  "delivery_proofs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    routeId: integer("route_id").references(() => deliveryRoutes.id),
    stopId: integer("stop_id").references(() => deliveryRouteStops.id),
    orderId: integer("order_id")
      .references(() => orders.id)
      .notNull(),
    actionCode: varchar("action_code", { length: 50 }).notNull(),
    photoUrl: text("photo_url"),
    notes: text("notes"),
    deliveredById: integer("delivered_by_id")
      .references(() => deliveryAgents.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_delivery_proofs_order").on(table.orderId)]
);

export const insertDeliveryProofSchema = createInsertSchema(deliveryProofs).omit({
  id: true,
  createdAt: true,
});
export type InsertDeliveryProof = z.infer<typeof insertDeliveryProofSchema>;
export type DeliveryProof = typeof deliveryProofs.$inferSelect;
