import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { stockLevels } from "@shared/schema";
import { applyStockMovement as applyProfessionalStockMovement } from "./stock-professional";

export async function ensureStockLevelRow(tenantId: number, branchId: number, productId: number) {
  const [row] = await db
    .select()
    .from(stockLevels)
    .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.branchId, branchId), eq(stockLevels.productId, productId)));

  if (row) return row;
  const [created] = await db
    .insert(stockLevels)
    .values({ tenantId, branchId, productId, quantity: "0", averageCost: "0" })
    .returning();
  return created;
}

export async function getStockLevel(tenantId: number, branchId: number, productId: number) {
  const [row] = await db
    .select()
    .from(stockLevels)
    .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.branchId, branchId), eq(stockLevels.productId, productId)));
  return row || null;
}

export async function applyStockMovement(params: {
  tenantId: number;
  branchId: number;
  productId: number;
  type: "TRANSFER_OUT" | "TRANSFER_IN" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "PURCHASE" | "SALE";
  quantity: number;
  referenceId?: number | null;
  note?: string | null;
  userId?: number | null;
}) {
  return applyProfessionalStockMovement({
    tenantId: params.tenantId,
    branchId: params.branchId,
    productId: params.productId,
    movementType: params.type,
    quantity: params.quantity,
    referenceId: params.referenceId || null,
    note: params.note || null,
    userId: params.userId || null,
  });
}

export async function getStockByBranch(tenantId: number, branchId: number) {
  return db
    .select({
      id: stockLevels.id,
      productId: stockLevels.productId,
      quantity: stockLevels.quantity,
      averageCost: stockLevels.averageCost,
      updatedAt: stockLevels.updatedAt,
    })
    .from(stockLevels)
    .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.branchId, branchId), sql`${stockLevels.quantity} <> 0`));
}
