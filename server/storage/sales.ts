import { db } from "../db";
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { calculateSaleTotals, round2, validateStock } from "../services/sales-calculation";
import { resolveProductUnitPrice } from "../services/pricing";
import {
  branches,
  cashMovements,
  cashSessions,
  productStockByBranch,
  products,
  saleItems,
  sales,
  tenantCounters,
  type InsertCashMovement,
} from "@shared/schema";

export type SaleAdjustmentType = "NONE" | "PERCENT" | "FIXED";

interface CreateSaleInput {
  tenantId: number;
  branchId: number | null;
  cashierUserId: number;
  currency: string;
  paymentMethod: string;
  notes: string | null;
  discountType: SaleAdjustmentType;
  discountValue: number;
  surchargeType: SaleAdjustmentType;
  surchargeValue: number;
  items: Array<{ productId: number; quantity: number; unitPrice?: number | null }>;
}


export const salesStorage = {
  async createSaleAtomic(input: CreateSaleInput) {
    return db.transaction(async (tx) => {
      const [branchCount] = await tx
        .select({ count: count() })
        .from(branches)
        .where(and(eq(branches.tenantId, input.tenantId), sql`${branches.deletedAt} IS NULL`));
      const hasBranches = (branchCount?.count || 0) > 0;
      const effectiveBranchId = hasBranches ? input.branchId : null;

      const requestedIds = Array.from(new Set(input.items.map((item) => item.productId)));
      const dbProducts = await tx.select().from(products).where(and(eq(products.tenantId, input.tenantId), inArray(products.id, requestedIds)));
      if (dbProducts.length !== requestedIds.length) {
        throw Object.assign(new Error("PRODUCT_NOT_FOUND"), { code: "PRODUCT_NOT_FOUND" });
      }

      const productMap = new Map(dbProducts.map((item) => [item.id, item]));
      const stockByProduct = new Map<number, number>();

      if (hasBranches) {
        if (!effectiveBranchId) {
          throw Object.assign(new Error("BRANCH_REQUIRED"), { code: "BRANCH_REQUIRED" });
        }
        const stockRows = await tx
          .select()
          .from(productStockByBranch)
          .where(
            and(
              eq(productStockByBranch.tenantId, input.tenantId),
              eq(productStockByBranch.branchId, effectiveBranchId),
              inArray(productStockByBranch.productId, requestedIds)
            )
          );
        for (const row of stockRows) stockByProduct.set(row.productId, row.stock || 0);
      }

      const enrichedItems = await Promise.all(input.items.map(async (row) => {
        const product = productMap.get(row.productId)!;
        const pricingMode = String(product.pricingMode || "MANUAL").toUpperCase();
        if (pricingMode === "MARGIN" && row.unitPrice !== undefined && row.unitPrice !== null) {
          throw Object.assign(new Error("MARGIN_PRICE_OVERRIDE_NOT_ALLOWED"), { code: "MARGIN_PRICE_OVERRIDE_NOT_ALLOWED", productId: row.productId });
        }
        const resolvedPrice = await resolveProductUnitPrice(product as any, input.tenantId, input.currency);
        const unitPrice = pricingMode === "MANUAL" && row.unitPrice !== undefined && row.unitPrice !== null
          ? Number(row.unitPrice)
          : resolvedPrice;
        const available = hasBranches
          ? stockByProduct.get(row.productId) ?? 0
          : Number(product.stock || 0);
        const lineTotal = round2(unitPrice * row.quantity);
        return { ...row, product, available, unitPrice, lineTotal };
      }));

      const insufficient = enrichedItems.find((item) => !validateStock(item.available, item.quantity));
      if (insufficient) {
        throw Object.assign(new Error("INSUFFICIENT_STOCK"), {
          code: "INSUFFICIENT_STOCK",
          productId: insufficient.productId,
          requested: insufficient.quantity,
          available: insufficient.available,
        });
      }

      const { subtotal, discountAmount, surchargeAmount, totalAmount } = calculateSaleTotals({
        lineTotals: enrichedItems.map((item) => item.lineTotal),
        discountType: input.discountType,
        discountValue: input.discountValue,
        surchargeType: input.surchargeType,
        surchargeValue: input.surchargeValue,
      });

      const counterRows = await tx.insert(tenantCounters).values({ tenantId: input.tenantId, key: "sales", value: 1 }).onConflictDoUpdate({
        target: [tenantCounters.tenantId, tenantCounters.key],
        set: { value: sql`${tenantCounters.value} + 1`, updatedAt: new Date() },
      }).returning({ value: tenantCounters.value });
      const counter = Number(counterRows[0]?.value || 1);
      const saleNumber = `V-${String(counter).padStart(6, "0")}`;

      const [sale] = await tx
        .insert(sales)
        .values({
          tenantId: input.tenantId,
          branchId: effectiveBranchId,
          cashierUserId: input.cashierUserId,
          saleNumber,
          saleDatetime: new Date(),
          currency: input.currency,
          subtotalAmount: String(subtotal),
          discountType: input.discountType,
          discountValue: String(input.discountValue || 0),
          discountAmount: String(discountAmount),
          surchargeType: input.surchargeType,
          surchargeValue: String(input.surchargeValue || 0),
          surchargeAmount: String(surchargeAmount),
          totalAmount: String(totalAmount),
          paymentMethod: input.paymentMethod,
          notes: input.notes,
        })
        .returning();

      await tx.insert(saleItems).values(
        enrichedItems.map((item) => ({
          saleId: sale.id,
          tenantId: input.tenantId,
          branchId: effectiveBranchId,
          productId: item.productId,
          productNameSnapshot: item.product.name,
          skuSnapshot: item.product.sku || null,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          lineTotal: String(item.lineTotal),
        }))
      );

      if (hasBranches && effectiveBranchId) {
        for (const item of enrichedItems) {
          const current = stockByProduct.get(item.productId) ?? 0;
          await tx
            .update(productStockByBranch)
            .set({ stock: current - item.quantity })
            .where(
              and(
                eq(productStockByBranch.tenantId, input.tenantId),
                eq(productStockByBranch.branchId, effectiveBranchId),
                eq(productStockByBranch.productId, item.productId)
              )
            );
        }
      } else {
        for (const item of enrichedItems) {
          const current = Number(item.product.stock || 0);
          await tx
            .update(products)
            .set({ stock: current - item.quantity })
            .where(and(eq(products.tenantId, input.tenantId), eq(products.id, item.productId)));
        }
      }

      const [openSession] = await tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.tenantId, input.tenantId),
            eq(cashSessions.status, "open"),
            effectiveBranchId ? eq(cashSessions.branchId, effectiveBranchId) : sql`${cashSessions.branchId} IS NULL`
          )
        )
        .limit(1);

      const cashData: InsertCashMovement = {
        tenantId: input.tenantId,
        sessionId: openSession?.id || null,
        branchId: effectiveBranchId,
        type: "ingreso",
        amount: String(totalAmount),
        method: input.paymentMethod.toLowerCase(),
        category: "venta",
        description: `Venta ${saleNumber}`,
        expenseDefinitionId: null,
        expenseDefinitionName: null,
        orderId: null,
        saleId: sale.id,
        createdById: input.cashierUserId,
      };
      await tx.insert(cashMovements).values(cashData);

      return { sale };
    });
  },

  async listSales(tenantId: number, filters: { branchId?: number | null; from?: Date; to?: Date; q?: string; limit: number; offset: number }) {
    const conditions = [eq(sales.tenantId, tenantId)];
    if (filters.branchId) conditions.push(eq(sales.branchId, filters.branchId));
    if (filters.from) conditions.push(gte(sales.saleDatetime, filters.from));
    if (filters.to) conditions.push(lte(sales.saleDatetime, filters.to));
    if (filters.q) conditions.push(or(ilike(sales.saleNumber, `%${filters.q}%`))!);

    return db
      .select()
      .from(sales)
      .where(and(...conditions))
      .orderBy(desc(sales.saleDatetime))
      .limit(filters.limit)
      .offset(filters.offset);
  },

  async getSaleById(id: number, tenantId: number) {
    const [sale] = await db.select().from(sales).where(and(eq(sales.id, id), eq(sales.tenantId, tenantId)));
    return sale;
  },

  async getSaleItems(id: number, tenantId: number) {
    return db.select().from(saleItems).where(and(eq(saleItems.saleId, id), eq(saleItems.tenantId, tenantId)));
  },
};
