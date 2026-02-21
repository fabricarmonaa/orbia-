import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  tenantAuth,
  requireFeature,
  enforceBranchScope,
  blockBranchScope,
  requireTenantAdmin,
  getTenantPlan,
} from "../auth";
import { queryProductsByFilters, productFiltersSchema } from "../services/product-filters";
import { generatePriceListPdf } from "../services/pdf/price-list";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { validateBody, validateQuery } from "../middleware/validate";
import { resolveProductUnitPrice } from "../services/pricing";
import { requireAddon } from "../middleware/require-addon";
import { ensureStatusExists, getDefaultStatus, getStatuses, normalizeStatusCode } from "../services/statuses";

const sanitizeOptionalShort = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().transform((value) => sanitizeShortText(value, max)).optional()
  );

const sanitizeOptionalLong = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().transform((value) => sanitizeLongText(value, max)).optional()
  );

const pricingModeSchema = z.enum(["MANUAL", "MARGIN"]);

const productBaseSchema = z.object({
  name: z.string().transform((value) => sanitizeShortText(value, 200)).refine((value) => value.length >= 2, "Nombre inválido"),
  description: sanitizeOptionalLong(1000).nullable(),
  price: z.coerce.number().min(0),
  sku: sanitizeOptionalShort(100).nullable(),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  cost: z.coerce.number().min(0).optional().nullable(),
  stock: z.coerce.number().int().min(0).optional().nullable(),
  pricingMode: pricingModeSchema.optional().default("MANUAL"),
  costAmount: z.coerce.number().min(0).optional().nullable(),
  costCurrency: sanitizeOptionalShort(10).nullable(),
  marginPct: z.coerce.number().min(0).max(1000).optional().nullable(),
  statusCode: z.string().max(40).optional().nullable(),
});

const productInputSchema = productBaseSchema.superRefine((value, ctx) => {
  const mode = (value.pricingMode || "MANUAL").toUpperCase();
  if (mode === "MARGIN") {
    if (value.costAmount === undefined || value.costAmount === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Costo requerido en modo margen", path: ["costAmount"] });
    }
    if (value.marginPct === undefined || value.marginPct === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Margen requerido en modo margen", path: ["marginPct"] });
    }
  }
});

const productUpdateSchema = productBaseSchema.partial().superRefine((value, ctx) => {
  const mode = (value.pricingMode || "MANUAL").toUpperCase();
  if (mode === "MARGIN") {
    if (value.costAmount === undefined || value.costAmount === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Costo requerido en modo margen", path: ["costAmount"] });
    }
    if (value.marginPct === undefined || value.marginPct === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Margen requerido en modo margen", path: ["marginPct"] });
    }
  }
});



const lookupQuerySchema = z.object({
  code: z.string().transform((value) => sanitizeShortText(value, 120)).refine((value) => value.length > 0, "Código requerido"),
});

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}


async function resolveTenantStockMode(tenantId: number): Promise<{ stockMode: "global" | "by_branch"; branchesCount: number }> {
  const branchesCount = Number(await storage.countBranchesByTenant(tenantId) || 0);
  if (branchesCount <= 0) return { stockMode: "global", branchesCount: 0 };
  const config = await storage.getConfig(tenantId);
  const raw = (config?.configJson as any)?.inventory?.stockMode;
  return { stockMode: raw === "by_branch" ? "by_branch" : "global", branchesCount };
}

async function persistTenantStockMode(tenantId: number, stockMode: "global" | "by_branch") {
  const config = await storage.getConfig(tenantId);
  const current = ((config?.configJson as Record<string, any>) || {});
  const next = {
    ...current,
    inventory: {
      ...(current.inventory || {}),
      stockMode,
    },
  };
  await storage.upsertConfig({ tenantId, configJson: next as any });
}

export function registerProductRoutes(app: Express) {
  app.get("/api/product-categories", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const data = await storage.getProductCategories(req.auth!.tenantId!);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    "/api/product-categories",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    validateBody(z.object({ name: z.string().transform((value) => sanitizeShortText(value, 120)).refine((value) => value.length >= 2, "Nombre inválido") })),
    async (req, res) => {
    try {
      const data = await storage.createProductCategory({
        tenantId: req.auth!.tenantId!,
        name: req.body.name,
      });
      res.status(201).json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/products", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const { stockMode, branchesCount } = await resolveTenantStockMode(tenantId);
      const byBranchMode = stockMode === "by_branch";
      const filters = productFiltersSchema.parse(req.query);
      const { data, total } = await queryProductsByFilters(tenantId, byBranchMode, filters);

      const productIds = data.map((p) => p.id);
      const productIdSet = new Set(productIds);
      const branchStockMap = new Map<number, Array<{ branchId: number; branchName: string; stock: number }>>();

      if (byBranchMode && productIds.length) {
        const allStockRows = await storage.getStockSummaryByTenant(tenantId);
        for (const row of allStockRows) {
          if (!productIdSet.has(row.productId)) continue;
          const list = branchStockMap.get(row.productId) || [];
          list.push({ branchId: row.branchId, branchName: row.branchName, stock: row.stock });
          branchStockMap.set(row.productId, list);
        }
      }

      const statuses = await getStatuses(tenantId, "PRODUCT", true);
      const statusMap = new Map(statuses.map((s) => [s.code, s]));
      const normalized = await Promise.all(data.map(async (p) => {
        const code = p.statusCode || (p.isActive ? "ACTIVE" : "INACTIVE");
        return {
          ...p,
          stockTotal: toNumber(p.stockTotal),
          status: statusMap.get(code) ? { code, label: statusMap.get(code)!.label, color: statusMap.get(code)!.color } : { code, label: code, color: "#6B7280" },
          estimatedSalePrice: await resolveProductUnitPrice(p as any, tenantId, "ARS").catch(() => Number(p.price)),
          branchStock: byBranchMode ? (branchStockMap.get(p.id) || []) : undefined,
        };
      }));

      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 20;
      res.json({
        data: normalized,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          stockMode,
          branchesCount,
        },
        stockMode,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtros inválidos. Revisá los valores ingresados.", code: "PRODUCT_FILTERS_INVALID" });
      }
      res.status(500).json({ error: err.message });
    }
  });



  app.get("/api/products/lookup", tenantAuth, requireFeature("products"), requireAddon("barcode_scanner"), validateQuery(lookupQuerySchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const query = req.query as z.infer<typeof lookupQuerySchema>;
      const product = await storage.getProductByCode(tenantId, query.code);
      if (!product) return res.status(404).json({ error: "Producto no encontrado", code: "PRODUCT_NOT_FOUND" });
      const stockTotal = Number((product as any).stock ?? 0);
      const estimatedSalePrice = await resolveProductUnitPrice(product as any, tenantId, "ARS").catch(() => Number(product.price));
      return res.json({ data: { ...product, stockTotal, estimatedSalePrice } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "No se pudo buscar el producto" });
    }
  });
  app.post(
    "/api/products",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    validateBody(productInputSchema),
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const { stockMode } = await resolveTenantStockMode(tenantId);
      const byBranchMode = stockMode === "by_branch";
      const payload = req.body as z.infer<typeof productInputSchema>;

      const statusCode = payload.statusCode ? normalizeStatusCode(payload.statusCode) : (await getDefaultStatus(tenantId, "PRODUCT"))?.code || "ACTIVE";
      await ensureStatusExists(tenantId, "PRODUCT", statusCode);
      const data = await storage.createProduct({
        tenantId,
        name: payload.name,
        description: payload.description || null,
        price: String(payload.price),
        sku: payload.sku || null,
        categoryId: payload.categoryId || null,
        cost: payload.cost !== null && payload.cost !== undefined ? String(payload.cost) : null,
        pricingMode: payload.pricingMode || "MANUAL",
        costAmount: payload.costAmount !== null && payload.costAmount !== undefined ? String(payload.costAmount) : null,
        costCurrency: payload.costCurrency || null,
        marginPct: payload.marginPct !== null && payload.marginPct !== undefined ? String(payload.marginPct) : null,
        stock: byBranchMode ? null : (payload.stock ?? 0),
        statusCode,
        isActive: statusCode !== "INACTIVE",
      });
      res.status(201).json({ data });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/products/:id/stock", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const product = await storage.getProductById(productId, tenantId);
      if (!product) return res.status(404).json({ error: "Producto no encontrado" });
      const { stockMode, branchesCount } = await resolveTenantStockMode(tenantId);

      if (stockMode !== "by_branch" || branchesCount <= 0) {
        return res.json({
          data: {
            stockByBranch: [],
            stockTotal: product.stock || 0,
            stockMode: "global",
            movements: [],
          },
        });
      }

      const [stockByBranch, branches] = await Promise.all([
        storage.getProductStockByBranch(productId, tenantId),
        storage.getBranches(tenantId),
      ]);
      const stockMap = new Map(stockByBranch.map((stock) => [stock.branchId, stock.stock ?? 0]));
      const stockView = branches.map((branch) => ({
        branchId: branch.id,
        branchName: branch.name,
        stock: stockMap.get(branch.id) ?? 0,
      }));
      const movements = await storage.getStockMovements(productId, tenantId);
      res.json({ data: { stockByBranch: stockView, movements, stockMode: "by_branch" } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch(
    "/api/products/:id/stock",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    enforceBranchScope,
    validateBody(z.object({
      mode: z.enum(["global", "by_branch"]),
      stock: z.coerce.number().int().min(0).optional(),
      branches: z.array(z.object({ branchId: z.coerce.number().int().positive(), stock: z.coerce.number().int().min(0) })).optional(),
      reason: sanitizeOptionalLong(200).nullable(),
    })),
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const { mode, stock, branches, reason } = req.body as { mode: "global" | "by_branch"; stock?: number; branches?: Array<{ branchId: number; stock: number }>; reason?: string | null };
      const product = await storage.getProductById(productId, tenantId);
      if (!product) return res.status(404).json({ error: "Producto no encontrado" });

      const { branchesCount } = await resolveTenantStockMode(tenantId);

      if (mode === "by_branch" && branchesCount <= 0) {
        return res.status(403).json({ error: "Stock por sucursal no disponible para este tenant", code: "FEATURE_NOT_ENABLED" });
      }

      if (mode === "global") {
        if (stock === undefined) return res.status(400).json({ error: "stock es obligatorio en modo global", code: "STOCK_REQUIRED" });
        await storage.updateProduct(productId, tenantId, { stock });
        await persistTenantStockMode(tenantId, "global");
        return res.json({ ok: true, productId, stockMode: "global", stock: { total: stock } });
      }

      const branchPayload = branches || [];
      if (!branchPayload.length) return res.status(400).json({ error: "branches es obligatorio en modo by_branch", code: "BRANCHES_REQUIRED" });
      const tenantBranches = await storage.getBranches(tenantId);
      const allowedIds = new Set(tenantBranches.map((b) => b.id));
      for (const item of branchPayload) {
        if (!allowedIds.has(item.branchId)) {
          return res.status(400).json({ error: `Sucursal inválida: ${item.branchId}`, code: "BRANCH_INVALID" });
        }
      }

      const existing = await storage.getProductStockByBranch(productId, tenantId);
      const existingMap = new Map(existing.map((x) => [x.branchId, Number(x.stock || 0)]));

      for (const item of branchPayload) {
        const before = existingMap.get(item.branchId) || 0;
        const after = Number(item.stock);
        await storage.upsertProductStockByBranch({ tenantId, productId, branchId: item.branchId, stock: after });
        const delta = after - before;
        if (delta !== 0) {
          await storage.createStockMovement({
            tenantId,
            productId,
            branchId: item.branchId,
            quantity: String(Math.abs(delta)),
            reason: reason || "Renovación stock",
            userId: req.auth!.userId,
          });
        }
      }

      const updated = await storage.getProductStockByBranch(productId, tenantId);
      const stockTotal = updated.reduce((acc, row) => acc + Number(row.stock || 0), 0);
      await storage.updateProduct(productId, tenantId, { stock: stockTotal });
      await persistTenantStockMode(tenantId, "by_branch");
      return res.json({ ok: true, productId, stockMode: "by_branch", stock: { total: stockTotal, byBranch: updated } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put(
    "/api/products/:id",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    validateBody(productUpdateSchema),
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const existing = await storage.getProductById(productId, tenantId);
      if (!existing) return res.status(404).json({ error: "Producto no encontrado" });
      const { stockMode } = await resolveTenantStockMode(tenantId);
      const byBranchMode = stockMode === "by_branch";

      const payload = req.body as z.infer<typeof productUpdateSchema>;

      const updateData: any = {};
      if (payload.name !== undefined) updateData.name = payload.name;
      if (payload.description !== undefined) updateData.description = payload.description;
      if (payload.price !== undefined) updateData.price = String(payload.price);
      if (payload.cost !== undefined) updateData.cost = payload.cost !== null ? String(payload.cost) : null;
      if (payload.pricingMode !== undefined) updateData.pricingMode = payload.pricingMode;
      if (payload.costAmount !== undefined) updateData.costAmount = payload.costAmount !== null ? String(payload.costAmount) : null;
      if (payload.costCurrency !== undefined) updateData.costCurrency = payload.costCurrency || null;
      if (payload.marginPct !== undefined) updateData.marginPct = payload.marginPct !== null ? String(payload.marginPct) : null;
      if (payload.stock !== undefined && !byBranchMode) updateData.stock = payload.stock;
      if (payload.sku !== undefined) updateData.sku = payload.sku;
      if (payload.categoryId !== undefined) updateData.categoryId = payload.categoryId;
      if (payload.statusCode !== undefined) {
        const statusCode = normalizeStatusCode(payload.statusCode || "");
        await ensureStatusExists(tenantId, "PRODUCT", statusCode);
        updateData.statusCode = statusCode;
        updateData.isActive = statusCode !== "INACTIVE";
      }

      const product = await storage.updateProduct(productId, tenantId, updateData);
      res.json({ data: product });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.patch(
    "/api/products/:id/toggle",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const existing = await storage.getProductById(productId, tenantId);
      if (!existing) return res.status(404).json({ error: "Producto no encontrado" });
      const nextActive = !existing.isActive;
      await storage.updateProduct(productId, tenantId, { isActive: nextActive, statusCode: nextActive ? "ACTIVE" : "INACTIVE" });
      res.json({ data: { isActive: nextActive, statusCode: nextActive ? "ACTIVE" : "INACTIVE" } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  app.delete(
    "/api/products/:id",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const existing = await storage.getProductById(productId, tenantId);
      if (!existing) return res.status(404).json({ error: "Producto no encontrado", code: "PRODUCT_NOT_FOUND" });
      await storage.updateProduct(productId, tenantId, { isActive: false, statusCode: "INACTIVE" });
      res.json({ data: { id: productId, deleted: true } });
    } catch {
      res.status(500).json({ error: "No se pudo eliminar el producto", code: "PRODUCT_DELETE_ERROR" });
    }
  });

  app.get("/api/products/export", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const plan = await getTenantPlan(tenantId);
      const pdfBuffer = await generatePriceListPdf(tenantId, { watermarkOrbia: (plan?.planCode || "").toUpperCase() === "ECONOMICO" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=productos.pdf");
      res.send(pdfBuffer);
    } catch (err: any) {
      res.status(500).json({ error: "No se pudo generar el PDF", code: "PDF_EXPORT_ERROR" });
    }
  });
}
