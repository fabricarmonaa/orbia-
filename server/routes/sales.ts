import type { Express } from "express";
import { z } from "zod";
import { enforceBranchScope, requireRoleAny, tenantAuth } from "../auth";
import { storage } from "../storage";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";

const optionalLong = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().transform((value) => sanitizeLongText(value, max)).optional()
  );

const itemSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
  unit_price: z.coerce.number().min(0).optional(),
});

const adjustmentSchema = z
  .object({
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.coerce.number().min(0),
  })
  .nullable()
  .optional();

const createSaleSchema = z.object({
  branch_id: z.coerce.number().int().positive().nullable().optional(),
  items: z.array(itemSchema).min(1),
  discount: adjustmentSchema,
  surcharge: adjustmentSchema,
  payment_method: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"]),
  notes: optionalLong(2000).nullable(),
});

const saleQuerySchema = z.object({
  branch_id: z.coerce.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().transform((value) => sanitizeShortText(value, 80)).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

function toDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export function registerSaleRoutes(app: Express) {
  app.post("/api/sales", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateBody(createSaleSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const payload = req.body as z.infer<typeof createSaleSchema>;

      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : (payload.branch_id ?? null);
      if (branchId) {
        const branch = await storage.getBranchById(branchId, tenantId);
        if (!branch) return res.status(403).json({ error: "Sucursal inválida", code: "BRANCH_FORBIDDEN" });
      }

      const created = await storage.createSaleAtomic({
        tenantId,
        branchId,
        cashierUserId: req.auth!.cashierId || req.auth!.userId,
        currency: "ARS",
        paymentMethod: payload.payment_method,
        notes: payload.notes || null,
        discountType: payload.discount?.type || "NONE",
        discountValue: payload.discount?.value || 0,
        surchargeType: payload.surcharge?.type || "NONE",
        surchargeValue: payload.surcharge?.value || 0,
        items: payload.items.map((item) => ({
          productId: item.product_id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
        })),
      });

      return res.status(201).json({
        sale_id: created.sale.id,
        sale_number: created.sale.saleNumber,
        total_amount: created.sale.totalAmount,
      });
    } catch (err: any) {
      if (err?.code === "INSUFFICIENT_STOCK") {
        return res.status(409).json({
          error: "Stock insuficiente",
          code: "INSUFFICIENT_STOCK",
          product_id: err.productId,
          requested: err.requested,
          available: err.available,
        });
      }
      if (err?.code === "PRODUCT_NOT_FOUND") {
        return res.status(404).json({ error: "Producto no encontrado", code: "PRODUCT_NOT_FOUND" });
      }
      if (err?.code === "MARGIN_PRICE_OVERRIDE_NOT_ALLOWED") {
        return res.status(400).json({ error: "No se puede enviar unit_price para productos por margen", code: "MARGIN_PRICE_OVERRIDE_NOT_ALLOWED", product_id: err.productId });
      }
      if (String(err?.message || "").startsWith("EXCHANGE_RATE_NOT_FOUND")) {
        return res.status(400).json({ error: "No hay cotización configurada para la moneda del costo", code: "EXCHANGE_RATE_NOT_FOUND" });
      }
      if (err?.code === "BRANCH_REQUIRED") {
        return res.status(400).json({ error: "Sucursal requerida", code: "BRANCH_REQUIRED" });
      }
      return res.status(500).json({ error: "No se pudo registrar la venta", code: "SALE_CREATE_ERROR" });
    }
  });

  app.get("/api/sales", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateQuery(saleQuerySchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const query = req.query as unknown as z.infer<typeof saleQuerySchema>;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : query.branch_id;
      const data = await storage.listSales(tenantId, {
        branchId,
        from: toDate(query.from),
        to: toDate(query.to),
        q: query.q,
        limit: query.limit,
        offset: query.offset,
      });
      res.json({ data });
    } catch {
      res.status(500).json({ error: "No se pudo obtener ventas", code: "SALE_LIST_ERROR" });
    }
  });

  app.get("/api/sales/:id", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const saleId = req.params.id as unknown as number;
      const sale = await storage.getSaleById(saleId, tenantId);
      if (!sale) return res.status(404).json({ error: "Venta no encontrada", code: "SALE_NOT_FOUND" });
      if (req.auth!.scope === "BRANCH" && sale.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "Sin acceso a esta venta", code: "BRANCH_FORBIDDEN" });
      }
      const items = await storage.getSaleItems(saleId, tenantId);
      res.json({ data: { sale, items } });
    } catch {
      res.status(500).json({ error: "No se pudo obtener detalle", code: "SALE_DETAIL_ERROR" });
    }
  });

  app.post("/api/sales/:id/print-data", tenantAuth, requireRoleAny(["admin", "staff", "CASHIER"]), enforceBranchScope, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const saleId = req.params.id as unknown as number;
      const sale = await storage.getSaleById(saleId, tenantId);
      if (!sale) return res.status(404).json({ error: "Venta no encontrada", code: "SALE_NOT_FOUND" });
      if (req.auth!.scope === "BRANCH" && sale.branchId !== req.auth!.branchId) {
        return res.status(403).json({ error: "Sin acceso a esta venta", code: "BRANCH_FORBIDDEN" });
      }
      const [items, branding, cashierUser, cashierProfile, allBranches] = await Promise.all([
        storage.getSaleItems(saleId, tenantId),
        storage.getTenantBranding(tenantId),
        sale.cashierUserId ? storage.getUserById(sale.cashierUserId, tenantId) : Promise.resolve(undefined),
        sale.cashierUserId ? storage.getCashierById(sale.cashierUserId, tenantId) : Promise.resolve(undefined),
        storage.getBranches(tenantId),
      ]);
      const branch = sale.branchId ? allBranches.find((b) => b.id === sale.branchId) : null;
      res.json({
        data: {
          empresa: {
            nombre: branding.displayName,
            logo_url: branding.logoUrl,
            slogan: String(branding.texts?.trackingFooter || ""),
          },
          cajero: {
            nombre: cashierProfile?.name || cashierUser?.fullName || "Sistema",
          },
          sucursal: branch ? { id: branch.id, nombre: branch.name } : { id: null, nombre: "CENTRAL" },
          venta: {
            id: sale.id,
            number: sale.saleNumber,
            datetime: sale.saleDatetime,
            payment: sale.paymentMethod,
            subtotal: sale.subtotalAmount,
            discount: sale.discountAmount,
            surcharge: sale.surchargeAmount,
            total: sale.totalAmount,
            notes: sale.notes,
            currency: sale.currency,
          },
          items: items.map((item) => ({
            qty: item.quantity,
            name: item.productNameSnapshot,
            sku: item.skuSnapshot,
            unit_price: item.unitPrice,
            line_total: item.lineTotal,
          })),
        },
      });
    } catch {
      res.status(500).json({ error: "No se pudo preparar ticket", code: "SALE_PRINT_ERROR" });
    }
  });
}
