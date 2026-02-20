import type { Express } from "express";
import { z } from "zod";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
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
const listQuery = z.object({ from: z.string().optional(), to: z.string().optional(), provider: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).default(0) });

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
      if (err?.code === "PRODUCT_NOT_FOUND") return res.status(404).json({ error: "Producto no encontrado", code: "PRODUCT_NOT_FOUND", productId: err.productId });
      return res.status(500).json({ error: "No se pudo crear la compra", code: "PURCHASE_CREATE_ERROR" });
    }
  });

  app.get("/api/purchases", tenantAuth, requireRoleAny(["admin", "staff"]), enforceBranchScope, validateQuery(listQuery), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const q = req.query as any;
    const filters = [eq(purchases.tenantId, tenantId)] as any[];
    if (q.from) filters.push(gte(purchases.purchaseDate, new Date(q.from)));
    if (q.to) filters.push(lte(purchases.purchaseDate, new Date(q.to)));
    if (q.provider) filters.push(sql`${purchases.providerName} ILIKE ${`%${q.provider}%`}`);
    if (req.auth?.scope === "BRANCH" && req.auth.branchId) filters.push(eq(purchases.branchId, req.auth.branchId));
    const rows = await db.select().from(purchases).where(and(...filters)).orderBy(desc(purchases.purchaseDate)).limit(q.limit).offset(q.offset);
    res.json({ data: rows });
  });

  app.get("/api/purchases/:id", tenantAuth, requireRoleAny(["admin", "staff"]), validateParams(z.object({ id: z.coerce.number().int().positive() })), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [purchase] = await db.select().from(purchases).where(and(eq(purchases.id, id), eq(purchases.tenantId, tenantId))).limit(1);
    if (!purchase) return res.status(404).json({ error: "Compra no encontrada", code: "PURCHASE_NOT_FOUND" });
    const items = await db.select().from(purchaseItems).where(and(eq(purchaseItems.purchaseId, id), eq(purchaseItems.tenantId, tenantId)));
    return res.json({ data: { ...purchase, items } });
  });
}
