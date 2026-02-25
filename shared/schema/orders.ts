import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  serial,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { tenants } from "./tenants";
import { branches } from "./branches";
import { users } from "./users";
import { sales } from "./sales";

export const orderStatuses = pgTable(
  "order_statuses",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    color: varchar("color", { length: 20 }).default("#6B7280"),
    sortOrder: integer("sort_order").default(0),
    isFinal: boolean("is_final").notNull().default(false),
  },
  (table) => [index("idx_order_statuses_tenant").on(table.tenantId)]
);

export const insertOrderStatusSchema = createInsertSchema(orderStatuses).omit({
  id: true,
});
export type InsertOrderStatus = z.infer<typeof insertOrderStatusSchema>;
export type OrderStatus = typeof orderStatuses.$inferSelect;

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    branchId: integer("branch_id").references(() => branches.id),
    orderNumber: integer("order_number").notNull(),
    type: varchar("type", { length: 50 }).notNull().default("PEDIDO"),
    customerName: varchar("customer_name", { length: 200 }),
    customerPhone: varchar("customer_phone", { length: 50 }),
    customerEmail: varchar("customer_email", { length: 255 }),
    description: text("description"),
    statusId: integer("status_id").references(() => orderStatuses.id),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
    scheduledAt: timestamp("scheduled_at"),
    closedAt: timestamp("closed_at"),
    publicTrackingId: varchar("public_tracking_id", { length: 100 }).unique(),
    trackingExpiresAt: timestamp("tracking_expires_at"),
    trackingRevoked: boolean("tracking_revoked").default(false),
    saleId: integer("sale_id").references(() => sales.id),
    salePublicToken: varchar("sale_public_token", { length: 120 }),
    requiresDelivery: boolean("requires_delivery").notNull().default(false),
    deliveryAddress: text("delivery_address"),
    deliveryCity: varchar("delivery_city", { length: 200 }),
    deliveryAddressNotes: text("delivery_address_notes"),
    deliveryReceiverName: varchar("delivery_receiver_name", { length: 200 }),
    deliveryReceiverPhone: varchar("delivery_receiver_phone", { length: 50 }),
    deliverySchedule: varchar("delivery_schedule", { length: 100 }),
    deliveryLat: numeric("delivery_lat", { precision: 10, scale: 7 }),
    deliveryLng: numeric("delivery_lng", { precision: 10, scale: 7 }),
    deliveryStatus: varchar("delivery_status", { length: 50 }),
    assignedAgentId: integer("assigned_agent_id"),
    createdById: integer("created_by_id").references(() => users.id),
    createdByScope: varchar("created_by_scope", { length: 20 }).default("TENANT"),
    createdByBranchId: integer("created_by_branch_id").references(() => branches.id),
    // Etapa A: which preset was used when creating this order
    orderPresetId: integer("order_preset_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_orders_tenant").on(table.tenantId),
    index("idx_orders_tenant_status_created").on(table.tenantId, table.statusId, table.createdAt),
    index("idx_orders_tenant_tracking").on(table.tenantId, table.publicTrackingId),
    index("idx_orders_tracking").on(table.publicTrackingId),
  ]
);

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    orderId: integer("order_id")
      .references(() => orders.id)
      .notNull(),
    statusId: integer("status_id").references(() => orderStatuses.id),
    changedById: integer("changed_by_id").references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_order_history_order").on(table.orderId)]
);

export const insertOrderStatusHistorySchema = createInsertSchema(
  orderStatusHistory
).omit({ id: true, createdAt: true });
export type InsertOrderStatusHistory = z.infer<
  typeof insertOrderStatusHistorySchema
>;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;

export const orderComments = pgTable(
  "order_comments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    orderId: integer("order_id")
      .references(() => orders.id)
      .notNull(),
    userId: integer("user_id").references(() => users.id),
    content: text("content").notNull(),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_order_comments_order").on(table.orderId)]
);

export const insertOrderCommentSchema = createInsertSchema(orderComments).omit({
  id: true,
  createdAt: true,
});
export type InsertOrderComment = z.infer<typeof insertOrderCommentSchema>;
export type OrderComment = typeof orderComments.$inferSelect;
