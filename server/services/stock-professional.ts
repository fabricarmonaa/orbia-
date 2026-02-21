import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { products, stockLevels, stockMovements, stockTransfers, stockTransferItems } from "@shared/schema";

export type MovementType = "SALE" | "PURCHASE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "TRANSFER_OUT" | "TRANSFER_IN" | "INITIAL";

async function getOrCreateLevel(tx: any, tenantId: number, productId: number, branchId: number | null) {
  const [row] = await tx
    .select()
    .from(stockLevels)
    .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.productId, productId), branchId === null ? sql`${stockLevels.branchId} IS NULL` : eq(stockLevels.branchId, branchId)));
  if (row) return row;
  const [created] = await tx.insert(stockLevels).values({ tenantId, productId, branchId, quantity: "0", averageCost: "0" }).returning();
  return created;
}

export async function applyStockMovement(args: {
  tenantId: number;
  productId: number;
  branchId: number | null;
  movementType: MovementType;
  referenceId?: number | null;
  quantity: number;
  unitCost?: number | null;
  note?: string | null;
  userId?: number | null;
}) {
  return db.transaction(async (tx) => {
    const level = await getOrCreateLevel(tx, args.tenantId, args.productId, args.branchId);
    const currentQty = Number(level.quantity || 0);
    const qty = Math.abs(Number(args.quantity || 0));
    const isOut = ["SALE", "ADJUSTMENT_OUT", "TRANSFER_OUT"].includes(args.movementType);
    const nextQty = isOut ? currentQty - qty : currentQty + qty;
    if (nextQty < 0) throw new Error("NEGATIVE_STOCK_NOT_ALLOWED");

    let nextAvg = Number(level.averageCost || 0);
    if (args.movementType === "PURCHASE" && args.unitCost !== undefined && args.unitCost !== null && qty > 0) {
      nextAvg = ((currentQty * nextAvg) + (qty * Number(args.unitCost))) / Math.max(nextQty, 1);
    }

    await tx.update(stockLevels).set({ quantity: String(nextQty), averageCost: String(nextAvg), updatedAt: new Date() }).where(eq(stockLevels.id, level.id));

    const [movement] = await tx.insert(stockMovements).values({
      tenantId: args.tenantId,
      productId: args.productId,
      branchId: args.branchId,
      movementType: args.movementType,
      referenceId: args.referenceId || null,
      quantity: String(qty),
      unitCost: args.unitCost !== undefined && args.unitCost !== null ? String(args.unitCost) : null,
      totalCost: args.unitCost !== undefined && args.unitCost !== null ? String(Number(args.unitCost) * qty) : null,
      note: args.note || null,
      reason: args.note || null,
      createdByUserId: args.userId || null,
      userId: args.userId || null,
    }).returning();

    return { levelAfter: nextQty, movement };
  });
}

export async function createTransfer(args: { tenantId: number; fromBranchId: number | null; toBranchId: number | null; items: Array<{ productId: number; quantity: number }>; createdBy: number; }) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx.insert(stockTransfers).values({
      tenantId: args.tenantId,
      fromBranchId: args.fromBranchId,
      toBranchId: args.toBranchId,
      createdBy: args.createdBy,
      status: "PENDING",
    }).returning();

    await tx.insert(stockTransferItems).values(args.items.map((i) => ({ transferId: transfer.id, productId: i.productId, quantity: String(i.quantity) })));
    return transfer;
  });
}

export async function completeTransfer(tenantId: number, id: number, userId: number) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.tenantId, tenantId)));
    if (!transfer) throw new Error("TRANSFER_NOT_FOUND");
    if (transfer.status !== "PENDING") throw new Error("TRANSFER_INVALID_STATUS");
    const items = await tx.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));

    for (const item of items) {
      const fromLevel = await getOrCreateLevel(tx, tenantId, item.productId, transfer.fromBranchId ?? null);
      const current = Number(fromLevel.quantity || 0);
      const qty = Number(item.quantity);
      if (current - qty < 0) throw new Error("NEGATIVE_STOCK_NOT_ALLOWED");

      await tx.update(stockLevels).set({ quantity: String(current - qty), updatedAt: new Date() }).where(eq(stockLevels.id, fromLevel.id));
      await tx.insert(stockMovements).values({ tenantId, productId: item.productId, branchId: transfer.fromBranchId ?? null, movementType: "TRANSFER_OUT", referenceId: id, quantity: String(qty), createdByUserId: userId, userId, note: `Transferencia #${id}` });

      const toLevel = await getOrCreateLevel(tx, tenantId, item.productId, transfer.toBranchId ?? null);
      const toCurrent = Number(toLevel.quantity || 0);
      await tx.update(stockLevels).set({ quantity: String(toCurrent + qty), updatedAt: new Date() }).where(eq(stockLevels.id, toLevel.id));
      await tx.insert(stockMovements).values({ tenantId, productId: item.productId, branchId: transfer.toBranchId ?? null, movementType: "TRANSFER_IN", referenceId: id, quantity: String(qty), createdByUserId: userId, userId, note: `Transferencia #${id}` });
    }

    const [done] = await tx.update(stockTransfers).set({ status: "COMPLETED", completedAt: new Date() }).where(eq(stockTransfers.id, id)).returning();
    return done;
  });
}

export async function cancelTransfer(tenantId: number, id: number) {
  const [row] = await db.update(stockTransfers).set({ status: "CANCELLED" }).where(and(eq(stockTransfers.id, id), eq(stockTransfers.tenantId, tenantId), eq(stockTransfers.status, "PENDING"))).returning();
  return row;
}

export async function getKardex(tenantId: number, productId: number, branchId?: number | null) {
  const rows = await db.select().from(stockMovements).where(and(eq(stockMovements.tenantId, tenantId), eq(stockMovements.productId, productId), branchId === undefined ? sql`true` : (branchId === null ? sql`${stockMovements.branchId} IS NULL` : eq(stockMovements.branchId, branchId)))).orderBy(desc(stockMovements.createdAt)).limit(300);
  let running = 0;
  const sorted = [...rows].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const map = new Map<number, number>();
  for (const m of sorted) {
    const q = Number(m.quantity || 0);
    if (["SALE", "ADJUSTMENT_OUT", "TRANSFER_OUT"].includes(m.movementType || "")) running -= q;
    else running += q;
    map.set(m.id, running);
  }
  return rows.map((m) => ({ ...m, stockAfter: map.get(m.id) || 0 }));
}

export async function getStockAlerts(tenantId: number, branchId?: number | null) {
  const rows = await db.select({
    productId: stockLevels.productId,
    branchId: stockLevels.branchId,
    quantity: stockLevels.quantity,
    minStock: products.minStock,
    name: products.name,
  }).from(stockLevels).innerJoin(products, and(eq(products.id, stockLevels.productId), eq(products.tenantId, tenantId))).where(and(eq(stockLevels.tenantId, tenantId), branchId === undefined ? sql`true` : (branchId === null ? sql`${stockLevels.branchId} IS NULL` : eq(stockLevels.branchId, branchId))));

  return rows.filter((r) => Number(r.quantity || 0) <= Number(r.minStock || 0));
}

export async function getTransfers(tenantId: number) {
  return db.select().from(stockTransfers).where(eq(stockTransfers.tenantId, tenantId)).orderBy(desc(stockTransfers.createdAt));
}

export async function getTransferItems(transferId: number) {
  return db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, transferId)).orderBy(asc(stockTransferItems.id));
}
