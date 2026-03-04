import type { Express, Request } from "express";
import { z } from "zod";
import { and, desc, eq, or } from "drizzle-orm";
import { tenantAuth, requireFeature, requireTenantAdmin } from "../auth";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { hasBranchAccessForUser, requireBranchAccess, resolveBranchScope } from "../middleware/branch-scope";
import { applyStockMovement, getStockByBranch } from "../services/stock";
import { cancelTransfer, createTransfer, receiveTransfer, sendTransfer } from "../services/stock-transfers";
import { db } from "../db";
import { stockTransferItems, stockTransfers } from "@shared/schema";
import { logAuditEventFromRequest } from "../services/audit";

const adjustSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  direction: z.enum(["IN", "OUT"]),
  reason: z.string().trim().min(2).max(200),
});

const stockQuery = z.object({ branchId: z.coerce.number().int().positive().optional() });

const transferCreateSchema = z.object({
  fromBranchId: z.coerce.number().int().positive(),
  toBranchId: z.coerce.number().int().positive(),
  items: z.array(z.object({ productId: z.coerce.number().int().positive(), qty: z.coerce.number().positive() })).min(1),
});

const transferParamSchema = z.object({ id: z.coerce.number().int().positive() });

async function assertBranchAccessOrThrow(req: Request, branchId: number) {
  const auth = req.auth!;
  const allowed = await hasBranchAccessForUser({
    tenantId: auth.tenantId!,
    userId: auth.userId,
    role: auth.role,
    scope: auth.scope,
    branchId,
  });
  if (!allowed) {
    const error = new Error("No tenés acceso a esta sucursal");
    (error as Error & { code?: string }).code = "BRANCH_FORBIDDEN";
    throw error;
  }
}

export function registerStockRoutes(app: Express) {
  app.get("/api/stock", tenantAuth, requireFeature("products"), resolveBranchScope(true), requireBranchAccess, validateQuery(stockQuery), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchId = (req as any).branchScopeId as number;
      const data = await getStockByBranch(tenantId, branchId);
      res.json({ data });
    } catch {
      res.status(500).json({ code: "STOCK_LIST_ERROR", message: "No se pudo obtener stock" });
    }
  });

  app.post("/api/stock/adjust", tenantAuth, requireFeature("products"), requireTenantAdmin, resolveBranchScope(true), requireBranchAccess, validateBody(adjustSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const p = req.body as z.infer<typeof adjustSchema>;
      const branchId = (req as any).branchScopeId as number;
      const movementType = p.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
      const result = await applyStockMovement({
        tenantId,
        branchId,
        productId: p.product_id,
        type: movementType,
        quantity: p.quantity,
        note: p.reason,
        userId: req.auth!.userId,
      });
      logAuditEventFromRequest(req, { action: "stock.transfer.ajuste", entityType: "stock", entityId: p.product_id, metadata: { branch_id: branchId, quantity: p.quantity, direction: p.direction } });
      res.status(201).json({ data: result });
    } catch (err: any) {
      if (err.message === "NEGATIVE_STOCK_NOT_ALLOWED") return res.status(409).json({ code: "NEGATIVE_STOCK_NOT_ALLOWED", message: "Stock insuficiente" });
      res.status(500).json({ code: "STOCK_ADJUST_ERROR", message: "No se pudo ajustar stock" });
    }
  });

  app.post("/api/stock/transfers", tenantAuth, requireFeature("products"), requireTenantAdmin, validateBody(transferCreateSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const payload = req.body as z.infer<typeof transferCreateSchema>;
      await assertBranchAccessOrThrow(req, payload.fromBranchId);
      await assertBranchAccessOrThrow(req, payload.toBranchId);

      const transfer = await createTransfer({ tenantId, fromBranchId: payload.fromBranchId, toBranchId: payload.toBranchId, items: payload.items, createdBy: req.auth!.userId });
      logAuditEventFromRequest(req, {
        action: "stock.transfer.create",
        entityType: "stock_transfer",
        entityId: transfer.id,
        metadata: { from_branch_id: payload.fromBranchId, to_branch_id: payload.toBranchId, items_count: payload.items.length },
      });
      res.status(201).json({ data: transfer });
    } catch (err: any) {
      if (err?.code === "BRANCH_FORBIDDEN") {
        return res.status(403).json({ code: "BRANCH_FORBIDDEN", message: "No tenés acceso a esta sucursal" });
      }
      res.status(500).json({ code: "STOCK_TRANSFER_CREATE_ERROR", message: "No se pudo crear la transferencia" });
    }
  });

  app.post("/api/stock/transfers/:id/send", tenantAuth, requireFeature("products"), requireTenantAdmin, validateParams(transferParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const [transfer] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.tenantId, tenantId), eq(stockTransfers.id, id)));
      if (!transfer) return res.status(404).json({ code: "TRANSFER_NOT_FOUND", message: "Transferencia no encontrada" });
      if (!transfer.fromBranchId) return res.status(409).json({ code: "TRANSFER_INVALID_BRANCH", message: "La transferencia no tiene sucursal origen" });
      await assertBranchAccessOrThrow(req, transfer.fromBranchId);
      const data = await sendTransfer(tenantId, id);
      logAuditEventFromRequest(req, {
        action: "stock.transfer.send",
        entityType: "stock_transfer",
        entityId: id,
        metadata: { from_branch_id: transfer.fromBranchId, to_branch_id: transfer.toBranchId, status: data.status },
      });
      res.json({ data });
    } catch (err: any) {
      if (err?.code === "BRANCH_FORBIDDEN") return res.status(403).json({ code: "BRANCH_FORBIDDEN", message: "No tenés acceso a esta sucursal" });
      res.status(409).json({ code: err.code || "STOCK_TRANSFER_SEND_ERROR", message: "No se pudo enviar la transferencia" });
    }
  });

  app.post("/api/stock/transfers/:id/receive", tenantAuth, requireFeature("products"), requireTenantAdmin, validateParams(transferParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const [transfer] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.tenantId, tenantId), eq(stockTransfers.id, id)));
      if (!transfer) return res.status(404).json({ code: "TRANSFER_NOT_FOUND", message: "Transferencia no encontrada" });
      if (!transfer.toBranchId) return res.status(409).json({ code: "TRANSFER_INVALID_BRANCH", message: "La transferencia no tiene sucursal destino" });
      await assertBranchAccessOrThrow(req, transfer.toBranchId);
      const data = await receiveTransfer(tenantId, id, req.auth!.userId);
      const items = await db.select({ id: stockTransferItems.id }).from(stockTransferItems).where(and(eq(stockTransferItems.transferId, id), eq(stockTransferItems.tenantId, tenantId)));
      logAuditEventFromRequest(req, {
        action: "stock.transfer.receive",
        entityType: "stock_transfer",
        entityId: id,
        metadata: { from_branch_id: transfer.fromBranchId, to_branch_id: transfer.toBranchId, items_count: items.length, status: data.status },
      });
      res.json({ data });
    } catch (err: any) {
      if (err?.code === "BRANCH_FORBIDDEN") return res.status(403).json({ code: "BRANCH_FORBIDDEN", message: "No tenés acceso a esta sucursal" });
      res.status(409).json({ code: err.code || "STOCK_TRANSFER_RECEIVE_ERROR", message: "No se pudo recibir la transferencia" });
    }
  });

  app.post("/api/stock/transfers/:id/cancel", tenantAuth, requireFeature("products"), requireTenantAdmin, validateParams(transferParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const [transfer] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.tenantId, tenantId), eq(stockTransfers.id, id)));
      if (!transfer) return res.status(404).json({ code: "TRANSFER_NOT_FOUND", message: "Transferencia no encontrada" });
      if (!transfer.fromBranchId) return res.status(409).json({ code: "TRANSFER_INVALID_BRANCH", message: "La transferencia no tiene sucursal origen" });
      await assertBranchAccessOrThrow(req, transfer.fromBranchId);
      const data = await cancelTransfer(tenantId, id);
      logAuditEventFromRequest(req, {
        action: "stock.transfer.cancel",
        entityType: "stock_transfer",
        entityId: id,
        metadata: { from_branch_id: transfer.fromBranchId, to_branch_id: transfer.toBranchId, status: data.status },
      });
      res.json({ data });
    } catch (err: any) {
      if (err?.code === "BRANCH_FORBIDDEN") return res.status(403).json({ code: "BRANCH_FORBIDDEN", message: "No tenés acceso a esta sucursal" });
      res.status(409).json({ code: err.code || "STOCK_TRANSFER_CANCEL_ERROR", message: "No se pudo cancelar la transferencia" });
    }
  });

  app.get("/api/stock/transfers", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchId = Number(req.query.branchId || 0) || null;
      if (branchId) {
        await assertBranchAccessOrThrow(req, branchId);
      }

      const condition = branchId
        ? and(eq(stockTransfers.tenantId, tenantId), or(eq(stockTransfers.fromBranchId, branchId), eq(stockTransfers.toBranchId, branchId)))
        : eq(stockTransfers.tenantId, tenantId);

      const transfers = await db.select().from(stockTransfers).where(condition).orderBy(desc(stockTransfers.createdAt));
      const data = await Promise.all(
        transfers.map(async (transfer) => ({
          ...transfer,
          items: await db.select().from(stockTransferItems).where(and(eq(stockTransferItems.transferId, transfer.id), eq(stockTransferItems.tenantId, tenantId))),
        })),
      );
      res.json({ data });
    } catch (err: any) {
      if (err?.code === "BRANCH_FORBIDDEN") return res.status(403).json({ code: "BRANCH_FORBIDDEN", message: "No tenés acceso a esta sucursal" });
      res.status(500).json({ code: "STOCK_TRANSFER_LIST_ERROR", message: "No se pudieron obtener transferencias" });
    }
  });
}
