import type { Express } from "express";
import { z } from "zod";
import { tenantAuth, requireTenantAdmin, requireFeature, blockBranchScope } from "../auth";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { applyStockMovement, getKardex, getStockAlerts } from "../services/stock-professional";

const adjustSchema = z.object({
  branch_id: z.coerce.number().int().positive().nullable().optional(),
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  direction: z.enum(["IN", "OUT"]),
  reason: z.string().trim().min(2).max(200),
});

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

}
