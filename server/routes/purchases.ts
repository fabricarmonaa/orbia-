import type { Express } from "express";
import { z } from "zod";
import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { tenantAuth, requireRoleAny, enforceBranchScope } from "../auth";
import { purchases, purchaseItems, products, stockLevels, stockMovements } from "@shared/schema";
import { validateBody, validateQuery, validateParams } from "../middleware/validate";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";

const itemSchema = z.object({ productId: z.coerce.number().int().positive(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().min(0) });
const createPurchaseSchema = z.object({
  branchId: z.coerce.number().int().positive().nullable().optional(),
  providerName: z.string().max(200).optional().nullable().transform((v) => (v ? sanitizeShortText(v, 200) : null)),
  purchaseDate: z.string().datetime().optional(),
  currency: z.string().max(10).optional().default("ARS").transform((v) => sanitizeShortText(v, 10).toUpperCase()),
  notes: z.string().max(1000).optional().nullable().transform((v) => (v ? sanitizeLongText(v, 1000) : null)),
  items: z.array(itemSchema).min(1),
});

const manualItemSchema = z.object({
  productName: z.string().min(1).max(200).transform((v) => sanitizeShortText(v, 200)),
  productCode: z.string().min(1).max(120).transform((v) => sanitizeShortText(v, 120)),
  unitPrice: z.coerce.number().min(0),
  qty: z.coerce.number().min(1),
});

const manualPurchaseSchema = z.object({
  supplierName: z.string().min(1).max(200).transform((v) => sanitizeShortText(v, 200)),
  currency: z.string().max(10).optional().default("ARS").transform((v) => sanitizeShortText(v, 10).toUpperCase()),
  items: z.array(manualItemSchema).min(1),
  notes: z.string().max(1000).optional().nullable().transform((v) => (v ? sanitizeLongText(v, 1000) : null)),
});

const listQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  provider: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

function migrationMissingError(err: any) {
  const msg = String(err?.message || "");
  return err?.code === "42P01" || /relation .* does not exist|does not exist/i.test(msg);
}

export function registerPurchaseCrudRoutes(app: Express) {
  app.post("/api/purchases", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, validateBody(createPurchaseSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const userId = req.auth!.userId;
    const payload = req.body as z.infer<typeof createPurchaseSchema>;
    const branchId = req.auth?.scope === "BRANCH" ? req.auth.branchId : (payload.branchId ?? null);

    try {
      const created = await db.transaction(async (tx) => {
        const [purchase] = await tx.insert(purchases).values({
          tenantId,
          branchId,
          providerName: payload.providerName || null,
          purchaseDate: payload.purchaseDate ? new Date(payload.purchaseDate) : new Date(),
          currency: payload.currency,
          notes: payload.notes || null,
          importedByUserId: userId,
          totalAmount: "0",
        }).returning();

        let total = 0;
        for (const item of payload.items) {
          const [product] = await tx.select({ id: products.id, name: products.name, sku: products.sku }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, item.productId))).limit(1);
          if (!product) throw Object.assign(new Error("PRODUCT_NOT_FOUND"), { code: "PRODUCT_NOT_FOUND", productId: item.productId });
          const lineTotal = Number(item.quantity) * Number(item.unitPrice);
          total += lineTotal;
          await tx.insert(purchaseItems).values({
            purchaseId: purchase.id,
            tenantId,
            branchId,
            productId: product.id,
            productCodeSnapshot: product.sku || null,
            productNameSnapshot: product.name,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
            lineTotal: String(lineTotal),
            currency: payload.currency,
          });

          const [level] = await tx.select().from(stockLevels).where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.productId, product.id), branchId ? eq(stockLevels.branchId, branchId) : sql`${stockLevels.branchId} IS NULL`)).limit(1);
          const currentQty = Number(level?.quantity || 0);
          const currentAvg = Number(level?.averageCost || 0);
          const qty = Number(item.quantity);
          const unitCost = Number(item.unitPrice);
          const nextQty = currentQty + qty;
          const nextAvg = nextQty > 0 ? (((currentQty * currentAvg) + (qty * unitCost)) / nextQty) : currentAvg;
          if (level) {
            await tx.update(stockLevels).set({ quantity: String(nextQty), averageCost: String(nextAvg), updatedAt: new Date() }).where(eq(stockLevels.id, level.id));
          } else {
            await tx.insert(stockLevels).values({ tenantId, productId: product.id, branchId, quantity: String(nextQty), averageCost: String(nextAvg) });
          }
          await tx.insert(stockMovements).values({
            tenantId,
            productId: product.id,
            branchId,
            movementType: "PURCHASE",
            referenceId: purchase.id,
            quantity: String(qty),
            unitCost: String(unitCost),
            totalCost: String(lineTotal),
            note: `Compra #${purchase.id}`,
            reason: `Compra #${purchase.id}`,
            createdByUserId: userId,
            userId,
          });
        }

        const [finalPurchase] = await tx.update(purchases).set({ totalAmount: String(total.toFixed(2)), updatedAt: new Date() }).where(eq(purchases.id, purchase.id)).returning();
        return finalPurchase;
      });
      return res.status(201).json({ data: created });
    } catch (err: any) {
      console.error("[purchases] PURCHASE_CREATE_ERROR", err);
      if (err?.code === "PRODUCT_NOT_FOUND") return res.status(404).json({ error: "Producto no encontrado", code: "PRODUCT_NOT_FOUND", productId: err.productId });
      if (migrationMissingError(err)) return res.status(500).json({ error: "Faltan migraciones de compras, ejecutar migrations/*.sql", code: "MIGRATION_MISSING" });
      return res.status(500).json({ error: "No se pudo crear la compra", code: "PURCHASE_CREATE_ERROR" });
    }
  });

  app.post("/api/purchases/manual", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, validateBody(manualPurchaseSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      const payload = req.body as z.infer<typeof manualPurchaseSchema>;

      const [tenantBranches, cfg] = await Promise.all([
        storage.getBranches(tenantId),
        storage.getConfig(tenantId),
      ]);
      const branchesCount = tenantBranches.length;
      const cfgMode = String((cfg?.configJson as any)?.inventory?.stockMode || "global");
      const stockMode: "global" | "by_branch" = branchesCount > 0 && cfgMode === "by_branch" ? "by_branch" : "global";
      const centralBranchId = tenantBranches
        .slice()
        .sort((a: any, b: any) => +new Date(a.createdAt || 0) - +new Date(b.createdAt || 0))[0]?.id || null;
      const branchId = req.auth?.scope === "BRANCH" ? req.auth.branchId : null;

      const created = await db.transaction(async (tx) => {
        const [purchase] = await tx.insert(purchases).values({
          tenantId,
          branchId,
          providerName: payload.supplierName,
          purchaseDate: new Date(),
          currency: payload.currency,
          notes: payload.notes || null,
          importedByUserId: userId,
          totalAmount: "0",
        }).returning();

        let total = 0;
        const updatedStock: Array<{ productId: number; code: string; before: number; after: number }> = [];

        for (const item of payload.items) {
          const qty = Number(item.qty);
          const unitPrice = Number(item.unitPrice);
          const lineTotal = qty * unitPrice;
          total += lineTotal;

          const [matchedProduct] = await tx
            .select({ id: products.id, name: products.name, sku: products.sku, stock: products.stock })
            .from(products)
            .where(and(eq(products.tenantId, tenantId), or(eq(products.sku, item.productCode), ilike(products.sku, item.productCode))))
            .limit(1);

          await tx.insert(purchaseItems).values({
            purchaseId: purchase.id,
            tenantId,
            branchId,
            productId: matchedProduct?.id ?? null,
            productCodeSnapshot: item.productCode,
            productNameSnapshot: item.productName,
            quantity: String(qty),
            unitPrice: String(unitPrice),
            lineTotal: String(lineTotal),
            currency: payload.currency,
          });

          if (!matchedProduct) continue;

          try {
            const stockBranchId = stockMode === "by_branch" ? (branchId || centralBranchId) : null;
            const [level] = await tx.select().from(stockLevels).where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.productId, matchedProduct.id), stockBranchId ? eq(stockLevels.branchId, stockBranchId) : sql`${stockLevels.branchId} IS NULL`)).limit(1);
            const before = Number(level?.quantity || 0);
            const avgBefore = Number(level?.averageCost || 0);
            const after = before + qty;
            const avgAfter = after > 0 ? (((before * avgBefore) + (qty * unitPrice)) / after) : avgBefore;

            if (level) {
              await tx.update(stockLevels).set({ quantity: String(after), averageCost: String(avgAfter), updatedAt: new Date() }).where(eq(stockLevels.id, level.id));
            } else {
              await tx.insert(stockLevels).values({ tenantId, productId: matchedProduct.id, branchId: stockBranchId, quantity: String(after), averageCost: String(avgAfter) });
            }

            const currentGlobalStock = Number(matchedProduct.stock || 0);
            await tx.update(products).set({ stock: currentGlobalStock + qty }).where(eq(products.id, matchedProduct.id));

            await tx.insert(stockMovements).values({
              tenantId,
              productId: matchedProduct.id,
              branchId: stockBranchId,
              movementType: "PURCHASE",
              referenceId: purchase.id,
              quantity: String(qty),
              unitCost: String(unitPrice),
              totalCost: String(lineTotal),
              note: `Compra manual #${purchase.id}`,
              reason: `Compra manual #${purchase.id}`,
              createdByUserId: userId,
              userId,
            });

            updatedStock.push({ productId: matchedProduct.id, code: item.productCode, before, after });
          } catch (stockErr) {
            console.warn("[purchases] PURCHASE_MANUAL_STOCK_UPDATE_WARN", (stockErr as any)?.message || stockErr);
          }
        }

        const [updatedPurchase] = await tx.update(purchases).set({ totalAmount: String(total.toFixed(2)), updatedAt: new Date() }).where(eq(purchases.id, purchase.id)).returning();
        const [itemCountRow] = await tx.select({ c: count() }).from(purchaseItems).where(and(eq(purchaseItems.purchaseId, purchase.id), eq(purchaseItems.tenantId, tenantId)));

        return {
          purchaseId: purchase.id,
          purchase: {
            id: purchase.id,
            number: String(purchase.id),
            createdAt: updatedPurchase.purchaseDate,
            supplierName: updatedPurchase.providerName,
            currency: updatedPurchase.currency,
            total: updatedPurchase.totalAmount,
            itemCount: Number(itemCountRow?.c || 0),
          },
          updatedStock,
        };
      });

      return res.status(201).json(created);
    } catch (err: any) {
      console.error("[purchases] PURCHASE_MANUAL_ERROR", err);
      if (migrationMissingError(err)) return res.status(500).json({ error: "Faltan migraciones de compras, ejecutar migrations/*.sql", code: "MIGRATION_MISSING" });
      return res.status(500).json({ error: "No se pudo guardar compra manual", code: "PURCHASE_MANUAL_ERROR", details: err?.message });
    }
  });

  app.get("/api/purchases", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, validateQuery(listQuery), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const q = req.query as any;
      const filters = [eq(purchases.tenantId, tenantId)] as any[];

      const fromDate = q.from ? new Date(String(q.from)) : null;
      if (fromDate && Number.isNaN(fromDate.getTime())) return res.status(400).json({ error: "Fecha desde inválida", code: "INVALID_DATE" });
      const toDate = q.to ? new Date(String(q.to)) : null;
      if (toDate && Number.isNaN(toDate.getTime())) return res.status(400).json({ error: "Fecha hasta inválida", code: "INVALID_DATE" });
      if (fromDate) filters.push(gte(purchases.purchaseDate, fromDate));
      if (toDate) filters.push(lte(purchases.purchaseDate, toDate));

      const qText = sanitizeShortText(String(q.q ?? q.provider ?? ""), 120).trim();
      if (qText) {
        const like = `%${qText}%`;
        filters.push(
          or(
            ilike(purchases.providerName, like),
            sql`EXISTS (
              SELECT 1 FROM purchase_items pi
              WHERE pi.purchase_id = ${purchases.id}
                AND pi.tenant_id = ${tenantId}
                AND (pi.product_name_snapshot ILIKE ${like} OR COALESCE(pi.product_code_snapshot, '') ILIKE ${like})
            )`
          )!
        );
      }

      if (req.auth?.scope === "BRANCH" && req.auth.branchId) filters.push(eq(purchases.branchId, req.auth.branchId));

      const limitNum = Number(q.limit ?? 30);
      const offsetNum = Number(q.offset ?? 0);
      if (!Number.isFinite(limitNum) || !Number.isFinite(offsetNum)) return res.status(400).json({ error: "Parámetros de paginado inválidos", code: "INVALID_PAGINATION" });

      const limit = Math.min(200, Math.max(1, Math.trunc(limitNum)));
      const offset = Math.max(0, Math.trunc(offsetNum));

      const where = and(...filters);

      const [rows, totalRows] = await Promise.all([
        db
          .select({
            id: purchases.id,
            number: purchases.id,
            createdAt: purchases.purchaseDate,
            supplierName: purchases.providerName,
            currency: purchases.currency,
            total: purchases.totalAmount,
            itemCount: sql<number>`(
              SELECT COUNT(*)::int FROM purchase_items pi
              WHERE pi.purchase_id = ${purchases.id}
                AND pi.tenant_id = ${tenantId}
            )`,
          })
          .from(purchases)
          .where(where)
          .orderBy(desc(purchases.purchaseDate), desc(purchases.id))
          .limit(limit)
          .offset(offset),
        db.select({ total: sql<number>`count(*)::int` }).from(purchases).where(where),
      ]);

      return res.json({ data: rows, meta: { limit, offset, total: Number(totalRows[0]?.total || 0) } });
    } catch (err: any) {
      console.error("[purchases] PURCHASE_LIST_ERROR", err);
      if (migrationMissingError(err)) return res.status(500).json({ error: "Faltan migraciones de compras, ejecutar migrations/*.sql", code: "MIGRATION_MISSING" });
      return res.status(500).json({ error: "No se pudo listar compras", code: "PURCHASE_LIST_ERROR" });
    }
  });

  app.get("/api/purchases/:id", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const [purchase] = await db
        .select({
          id: purchases.id,
          number: purchases.id,
          createdAt: purchases.purchaseDate,
          supplierName: purchases.providerName,
          currency: purchases.currency,
          total: purchases.totalAmount,
        })
        .from(purchases)
        .where(and(eq(purchases.id, id), eq(purchases.tenantId, tenantId)))
        .limit(1);
      if (!purchase) return res.status(404).json({ error: "Compra no encontrada", code: "PURCHASE_NOT_FOUND" });

      const items = await db
        .select({
          productName: purchaseItems.productNameSnapshot,
          productCode: purchaseItems.productCodeSnapshot,
          unitPrice: purchaseItems.unitPrice,
          qty: purchaseItems.quantity,
          lineTotal: purchaseItems.lineTotal,
        })
        .from(purchaseItems)
        .where(and(eq(purchaseItems.purchaseId, id), eq(purchaseItems.tenantId, tenantId)));

      return res.json({ purchase, items });
    } catch (err: any) {
      console.error("[purchases] PURCHASE_DETAIL_ERROR", err);
      if (migrationMissingError(err)) return res.status(500).json({ error: "Faltan migraciones de compras, ejecutar migrations/*.sql", code: "MIGRATION_MISSING" });
      return res.status(500).json({ error: "No se pudo obtener compra", code: "PURCHASE_DETAIL_ERROR" });
    }
  });
}
