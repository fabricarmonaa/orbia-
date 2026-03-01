import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { orders, orderStatusHistory } from "@shared/schema";
import { storage } from "../storage";

export async function validateOrderScope(tenantId: number, orderId: number, scope: "TENANT" | "BRANCH", branchId?: number | null) {
  const order = await storage.getOrderById(orderId, tenantId);
  if (!order) return { ok: false as const, status: 404, message: "Pedido no encontrado" };
  if (scope === "BRANCH" && order.branchId !== branchId) return { ok: false as const, status: 403, message: "No tenés acceso a este pedido" };
  return { ok: true as const, order };
}

export async function changeOrderStatusWithHistory(params: { tenantId: number; orderId: number; statusId: number; changedById: number; note?: string | null }) {
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ statusId: params.statusId, updatedAt: new Date() })
      .where(and(eq(orders.id, params.orderId), eq(orders.tenantId, params.tenantId)));

    await tx.insert(orderStatusHistory).values({
      tenantId: params.tenantId,
      orderId: params.orderId,
      statusId: params.statusId,
      changedById: params.changedById,
      note: params.note || null,
    });
  });
}

export async function createOrderWithIdempotency<T>(run: () => Promise<T>) {
  return run();
}
