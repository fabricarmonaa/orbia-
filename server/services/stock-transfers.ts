import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { stockTransferItems, stockTransfers } from "@shared/schema";
import { applyStockMovement } from "./stock";

type TransferRow = typeof stockTransfers.$inferSelect;
type TransferItemRow = typeof stockTransferItems.$inferSelect;

interface ReceiveTransferDeps {
  findTransfer: (tenantId: number, transferId: number) => Promise<TransferRow | null>;
  findItems: (tenantId: number, transferId: number) => Promise<TransferItemRow[]>;
  applyMovement: typeof applyStockMovement;
  markReceived: (tenantId: number, transferId: number) => Promise<TransferRow>;
}

const defaultReceiveDeps: ReceiveTransferDeps = {
  async findTransfer(tenantId, transferId) {
    const [transfer] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.tenantId, tenantId), eq(stockTransfers.id, transferId)));
    return transfer ?? null;
  },
  async findItems(tenantId, transferId) {
    return db.select().from(stockTransferItems).where(and(eq(stockTransferItems.transferId, transferId), eq(stockTransferItems.tenantId, tenantId)));
  },
  applyMovement: applyStockMovement,
  async markReceived(tenantId, transferId) {
    const [received] = await db
      .update(stockTransfers)
      .set({ status: "RECEIVED", completedAt: new Date() })
      .where(and(eq(stockTransfers.id, transferId), eq(stockTransfers.tenantId, tenantId)))
      .returning();
    return received;
  },
};

export async function createTransfer(params: {
  tenantId: number;
  fromBranchId: number;
  toBranchId: number;
  items: Array<{ productId: number; qty: number }>;
  createdBy: number;
}) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx
      .insert(stockTransfers)
      .values({
        tenantId: params.tenantId,
        fromBranchId: params.fromBranchId,
        toBranchId: params.toBranchId,
        status: "DRAFT",
        createdBy: params.createdBy,
      })
      .returning();

    if (params.items.length) {
      await tx.insert(stockTransferItems).values(
        params.items.map((item) => ({
          tenantId: params.tenantId,
          transferId: transfer.id,
          productId: item.productId,
          quantity: String(item.qty),
        })),
      );
    }

    return transfer;
  });
}

export async function sendTransfer(tenantId: number, transferId: number) {
  const [updated] = await db
    .update(stockTransfers)
    .set({ status: "SENT" })
    .where(and(eq(stockTransfers.tenantId, tenantId), eq(stockTransfers.id, transferId), eq(stockTransfers.status, "DRAFT")))
    .returning();
  if (!updated) {
    const [exists] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.tenantId, tenantId), eq(stockTransfers.id, transferId)));
    if (!exists) throw Object.assign(new Error("TRANSFER_NOT_FOUND"), { code: "TRANSFER_NOT_FOUND" });
    if (exists.status === "SENT" || exists.status === "RECEIVED") return exists;
    throw Object.assign(new Error("TRANSFER_INVALID_STATUS"), { code: "TRANSFER_INVALID_STATUS" });
  }
  return updated;
}

export async function receiveTransferWithDeps(tenantId: number, transferId: number, userId: number, deps: ReceiveTransferDeps) {
  const transfer = await deps.findTransfer(tenantId, transferId);
  if (!transfer) throw Object.assign(new Error("TRANSFER_NOT_FOUND"), { code: "TRANSFER_NOT_FOUND" });
  if (transfer.status === "RECEIVED") return transfer;
  if (transfer.status !== "SENT" && transfer.status !== "PENDING") {
    throw Object.assign(new Error("TRANSFER_INVALID_STATUS"), { code: "TRANSFER_INVALID_STATUS" });
  }
  if (!transfer.fromBranchId || !transfer.toBranchId) {
    throw Object.assign(new Error("TRANSFER_INVALID_BRANCH"), { code: "TRANSFER_INVALID_BRANCH" });
  }

  const items = await deps.findItems(tenantId, transferId);

  for (const item of items) {
    const qty = Number(item.quantity || 0);
    await deps.applyMovement({ tenantId, branchId: transfer.fromBranchId, productId: item.productId, type: "TRANSFER_OUT", quantity: qty, referenceId: transferId, note: `Transferencia #${transferId}`, userId });
    await deps.applyMovement({ tenantId, branchId: transfer.toBranchId, productId: item.productId, type: "TRANSFER_IN", quantity: qty, referenceId: transferId, note: `Transferencia #${transferId}`, userId });
  }

  return deps.markReceived(tenantId, transferId);
}

export async function receiveTransfer(tenantId: number, transferId: number, userId: number) {
  return receiveTransferWithDeps(tenantId, transferId, userId, defaultReceiveDeps);
}

export async function cancelTransfer(tenantId: number, transferId: number) {
  const [row] = await db
    .update(stockTransfers)
    .set({ status: "CANCELLED" })
    .where(and(eq(stockTransfers.tenantId, tenantId), eq(stockTransfers.id, transferId), eq(stockTransfers.status, "DRAFT")))
    .returning();
  if (!row) throw Object.assign(new Error("TRANSFER_INVALID_STATUS"), { code: "TRANSFER_INVALID_STATUS" });
  return row;
}
