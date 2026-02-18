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

const productInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  price: z.coerce.number().min(0),
  sku: z.string().trim().max(100).optional().nullable(),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  cost: z.coerce.number().min(0).optional().nullable(),
  stock: z.coerce.number().int().min(0).optional().nullable(),
});

const productUpdateSchema = productInputSchema.partial();

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
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
      const branchCount = await storage.countBranchesByTenant(tenantId);
      const hasBranches = branchCount > 0;
      const filters = productFiltersSchema.parse(req.query);
      const { data, total } = await queryProductsByFilters(tenantId, hasBranches, filters);

      const productIds = data.map((p) => p.id);
      const branchStockMap = new Map<number, Array<{ branchId: number; branchName: string; stock: number }>>();

      if (hasBranches && productIds.length) {
        const allStockRows = await storage.getStockSummaryByTenant(tenantId);
        for (const row of allStockRows) {
          if (!productIds.includes(row.productId)) continue;
          const list = branchStockMap.get(row.productId) || [];
          list.push({ branchId: row.branchId, branchName: row.branchName, stock: row.stock });
          branchStockMap.set(row.productId, list);
        }
      }

      const normalized = data.map((p) => ({
        ...p,
        stockTotal: toNumber(p.stockTotal),
        branchStock: hasBranches ? (branchStockMap.get(p.id) || []) : undefined,
      }));

      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 20;
      const stockMode = hasBranches ? "by_branch" : "global";

      res.json({
        data: normalized,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          stockMode,
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

  app.post(
    "/api/products",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchCount = await storage.countBranchesByTenant(tenantId);
      const hasBranches = branchCount > 0;
      const payload = productInputSchema.parse(req.body);

      const data = await storage.createProduct({
        tenantId,
        name: payload.name,
        description: payload.description || null,
        price: String(payload.price),
        sku: payload.sku || null,
        categoryId: payload.categoryId || null,
        cost: payload.cost !== null && payload.cost !== undefined ? String(payload.cost) : null,
        stock: hasBranches ? null : (payload.stock ?? 0),
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
      const branchCount = await storage.countBranchesByTenant(tenantId);
      const hasBranches = branchCount > 0;

      if (!hasBranches) {
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
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const { branchId, stock, reason } = req.body;
      if (branchId === undefined || stock === undefined) {
        return res.status(400).json({ error: "branchId y stock son obligatorios" });
      }
      const stockNum = parseInt(String(stock));
      if (isNaN(stockNum) || stockNum < 0) {
        return res.status(400).json({ error: "Stock debe ser un número entero no negativo" });
      }
      const product = await storage.getProductById(productId, tenantId);
      if (!product) return res.status(404).json({ error: "Producto no encontrado" });

      const targetBranchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : branchId;
      const existing = await storage.getProductStockByBranch(productId, tenantId);
      const prev = existing.find(s => s.branchId === targetBranchId);
      const prevStock = prev?.stock || 0;
      const delta = stockNum - prevStock;

      await storage.upsertProductStockByBranch({
        tenantId,
        productId,
        branchId: targetBranchId,
        stock: stockNum,
      });

      if (delta !== 0) {
        await storage.createStockMovement({
          tenantId,
          productId,
          branchId: targetBranchId,
          quantity: delta,
          reason: reason || null,
          userId: req.auth!.userId,
        });
      }

      const updatedStock = await storage.getProductStockByBranch(productId, tenantId);
      res.json({ data: updatedStock });
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
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const existing = await storage.getProductById(productId, tenantId);
      if (!existing) return res.status(404).json({ error: "Producto no encontrado" });
      const branchCount = await storage.countBranchesByTenant(tenantId);
      const hasBranches = branchCount > 0;

      const payload = productUpdateSchema.parse(req.body);

      const updateData: any = {};
      if (payload.name !== undefined) updateData.name = payload.name;
      if (payload.description !== undefined) updateData.description = payload.description;
      if (payload.price !== undefined) updateData.price = String(payload.price);
      if (payload.cost !== undefined) updateData.cost = payload.cost !== null ? String(payload.cost) : null;
      if (payload.stock !== undefined && !hasBranches) updateData.stock = payload.stock;
      if (payload.sku !== undefined) updateData.sku = payload.sku;
      if (payload.categoryId !== undefined) updateData.categoryId = payload.categoryId;

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
      await storage.toggleProductActive(productId, tenantId, !existing.isActive);
      res.json({ data: { isActive: !existing.isActive } });
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
      await storage.toggleProductActive(productId, tenantId, false);
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
