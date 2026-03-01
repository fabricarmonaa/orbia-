import { db } from "../db";
import { eq, and, desc, sql, count, lt, or } from "drizzle-orm";
import {
  orders, orderStatuses, orderStatusHistory, orderComments,
  type InsertOrder, type InsertOrderStatus, type InsertOrderStatusHistory, type InsertOrderComment,
} from "@shared/schema";
import { resolvePagination } from "../utils/pagination";

export const orderStorage = {
  async getOrderStatuses(tenantId: number) {
    return db
      .select()
      .from(orderStatuses)
      .where(eq(orderStatuses.tenantId, tenantId))
      .orderBy(orderStatuses.sortOrder);
  },
  async getOrderStatusById(id: number, tenantId: number) {
    const [status] = await db
      .select()
      .from(orderStatuses)
      .where(and(eq(orderStatuses.id, id), eq(orderStatuses.tenantId, tenantId)));
    return status;
  },
  async createOrderStatus(data: InsertOrderStatus) {
    const [status] = await db.insert(orderStatuses).values(data).returning();
    return status;
  },
  async getOrders(tenantId: number, pagination?: { limit?: number; page?: number; cursor?: string; offset?: number }) {
    const { limit, offset, cursor } = resolvePagination(pagination || {});
    const rows = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          cursor
            ? or(
                lt(orders.createdAt, new Date(cursor.createdAt)),
                and(eq(orders.createdAt, new Date(cursor.createdAt)), lt(orders.id, cursor.id))
              )
            : undefined,
        )
      )
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit)
      .offset(cursor ? 0 : offset);
    const nextCursor = rows.length === limit
      ? Buffer.from(JSON.stringify({ createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id }), "utf8").toString("base64url")
      : null;
    return { data: rows, meta: { limit, offset: cursor ? 0 : offset, nextCursor } };
  },
  async getOrderById(id: number, tenantId: number) {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));
    return order;
  },
  async getOrderByTrackingId(trackingId: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.publicTrackingId, trackingId));
    return order;
  },
  async createOrder(data: InsertOrder) {
    const [order] = await db.insert(orders).values(data).returning();
    return order;
  },
  async updateOrderStatus(id: number, tenantId: number, statusId: number) {
    await db
      .update(orders)
      .set({ statusId, updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));
  },
  async updateOrderTracking(id: number, tenantId: number, trackingId: string, expiresAt: Date) {
    await db
      .update(orders)
      .set({ publicTrackingId: trackingId, trackingExpiresAt: expiresAt, trackingRevoked: false })
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));
  },
  async linkOrderSale(id: number, tenantId: number, saleId: number, salePublicToken: string | null) {
    await db
      .update(orders)
      .set({ saleId, salePublicToken, updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));
  },

  async getNextOrderNumber(tenantId: number) {
    const result = await db
      .select({ maxNum: sql<number>`COALESCE(MAX(${orders.orderNumber}), 0)` })
      .from(orders)
      .where(eq(orders.tenantId, tenantId));
    return (result[0]?.maxNum || 0) + 1;
  },
  async countOrders(tenantId: number, branchId?: number | null) {
    const conditions = [eq(orders.tenantId, tenantId)];
    if (branchId) conditions.push(eq(orders.branchId, branchId));
    const [result] = await db
      .select({ count: count() })
      .from(orders)
      .where(and(...conditions));
    return result?.count || 0;
  },
  async getOrderHistory(orderId: number, tenantId: number) {
    return db
      .select()
      .from(orderStatusHistory)
      .where(and(eq(orderStatusHistory.orderId, orderId), eq(orderStatusHistory.tenantId, tenantId)))
      .orderBy(desc(orderStatusHistory.createdAt));
  },
  async createOrderHistory(data: InsertOrderStatusHistory) {
    await db.insert(orderStatusHistory).values(data);
  },
  async getOrderComments(orderId: number, tenantId: number) {
    return db
      .select()
      .from(orderComments)
      .where(and(eq(orderComments.orderId, orderId), eq(orderComments.tenantId, tenantId)))
      .orderBy(desc(orderComments.createdAt));
  },
  async getPublicOrderComments(orderId: number) {
    return db
      .select()
      .from(orderComments)
      .where(and(eq(orderComments.orderId, orderId), eq(orderComments.isPublic, true)))
      .orderBy(desc(orderComments.createdAt));
  },
  async createOrderComment(data: InsertOrderComment) {
    const [comment] = await db.insert(orderComments).values(data).returning();
    return comment;
  },
  async getOrdersByBranch(tenantId: number, branchId: number, pagination?: { limit?: number; page?: number; cursor?: string; offset?: number }) {
    const { limit, offset, cursor } = resolvePagination(pagination || {});
    const rows = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.branchId, branchId),
          cursor
            ? or(
                lt(orders.createdAt, new Date(cursor.createdAt)),
                and(eq(orders.createdAt, new Date(cursor.createdAt)), lt(orders.id, cursor.id))
              )
            : undefined,
        )
      )
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit)
      .offset(cursor ? 0 : offset);
    const nextCursor = rows.length === limit
      ? Buffer.from(JSON.stringify({ createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id }), "utf8").toString("base64url")
      : null;
    return { data: rows, meta: { limit, offset: cursor ? 0 : offset, nextCursor } };
  },
};
