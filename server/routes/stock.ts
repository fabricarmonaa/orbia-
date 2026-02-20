import type { Express } from "express";
import { z } from "zod";
import { tenantAuth, requireTenantAdmin, requireFeature, blockBranchScope } from "../auth";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { applyStockMovement, cancelTransfer, completeTransfer, createTransfer, getKardex, getStockAlerts, getTransferItems, getTransfers } from "../services/stock-professional";

const adjustSchema = z.object({
  branch_id: z.coerce.number().int().positive().nullable().optional(),
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  direction: z.enum(["IN", "OUT"]),
  reason: z.string().trim().min(2).max(200),
});

const createTransferSchema = z.object({
  from_branch_id: z.coerce.number().int().positive().nullable().optional(),
  to_branch_id: z.coerce.number().int().positive().nullable().optional(),
  items: z.array(z.object({ product_id: z.coerce.number().int().positive(), quantity: z.coerce.number().positive() })).min(1),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });
const kardexQuery = z.object({ product_id: z.coerce.number().int().positive(), branch_id: z.coerce.number().int().positive().optional() });

export function registerStockRoutes(app: Express) {
  app.post("/api/stock/adjust", tenantAuth, requireFeature("products"), requireTenantAdmin, blockBranchScope, validateBody(adjustSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const p = req.body as z.infer<typeof adjustSchema>;
      const movementType = p.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
      const result = await applyStockMovement({
        tenantId,
        productId: p.product_id,
        branchId: p.branch_id ?? null,
        movementType,
        quantity: p.quantity,
        note: p.reason,
        userId: req.auth!.userId,
      });
      res.status(201).json({ data: result });
    } catch (err: any) {
      if (err.message === "NEGATIVE_STOCK_NOT_ALLOWED") return res.status(409).json({ error: "Stock insuficiente", code: "NEGATIVE_STOCK_NOT_ALLOWED" });
      res.status(500).json({ error: "No se pudo ajustar stock" });
    }
  });

  app.get("/api/stock/kardex", tenantAuth, requireFeature("products"), validateQuery(kardexQuery), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const q = req.query as any;
    const data = await getKardex(tenantId, Number(q.product_id), q.branch_id ? Number(q.branch_id) : undefined);
    res.json({ data });
  });

  app.get("/api/stock/alerts", tenantAuth, requireFeature("products"), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : undefined;
    const data = await getStockAlerts(tenantId, branchId);
    res.json({ data, total: data.length });
  });

  app.post("/api/stock/transfers", tenantAuth, requireFeature("products"), requireTenantAdmin, blockBranchScope, validateBody(createTransferSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const p = req.body as z.infer<typeof createTransferSchema>;
    const data = await createTransfer({ tenantId, fromBranchId: p.from_branch_id ?? null, toBranchId: p.to_branch_id ?? null, items: p.items.map((i) => ({ productId: i.product_id, quantity: i.quantity })), createdBy: req.auth!.userId });
    res.status(201).json({ data });
  });

  app.post("/api/stock/transfers/:id/complete", tenantAuth, requireFeature("products"), requireTenantAdmin, blockBranchScope, validateParams(idParam), async (req, res) => {
    try {
      const data = await completeTransfer(req.auth!.tenantId!, Number(req.params.id), req.auth!.userId);
      res.json({ data });
    } catch (err: any) {
      if (err.message === "NEGATIVE_STOCK_NOT_ALLOWED") return res.status(409).json({ error: "Stock insuficiente en origen", code: "NEGATIVE_STOCK_NOT_ALLOWED" });
      if (err.message === "TRANSFER_NOT_FOUND") return res.status(404).json({ error: "Transferencia no encontrada" });
      res.status(400).json({ error: "No se pudo completar transferencia", code: err.message || "TRANSFER_COMPLETE_ERROR" });
    }
  });

  app.post("/api/stock/transfers/:id/cancel", tenantAuth, requireFeature("products"), requireTenantAdmin, blockBranchScope, validateParams(idParam), async (req, res) => {
    const data = await cancelTransfer(req.auth!.tenantId!, Number(req.params.id));
    if (!data) return res.status(404).json({ error: "Transferencia no encontrada o no pendiente" });
    res.json({ data });
  });

  app.get("/api/stock/transfers", tenantAuth, requireFeature("products"), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const list = await getTransfers(tenantId);
    const withItems = await Promise.all(list.map(async (t) => ({ ...t, items: await getTransferItems(t.id) })));
    res.json({ data: withItems });
  });
}
