import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { products, saleItems, sales } from "@shared/schema";

export type DashboardAnalytics = {
  avgTicket: number;
  staleProducts60d: number;
  topProductMonth: {
    productId: number;
    name: string;
    units: number;
  } | null;
};

export async function getDashboardAnalytics(tenantId: number, branchId?: number | null): Promise<DashboardAnalytics> {
  const now = new Date();
  const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const branchCond = branchId ? eq(sales.branchId, branchId) : undefined;

  const [avgRow] = await db
    .select({ avgTicket: sql<number>`COALESCE(AVG(${sales.totalAmount}), 0)` })
    .from(sales)
    .where(and(eq(sales.tenantId, tenantId), branchCond));

  const soldProductsLast60d = db
    .selectDistinct({ productId: saleItems.productId })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, sixtyDaysAgo), branchCond));

  const [staleRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.isActive, true),
        sql`${products.id} NOT IN (${soldProductsLast60d})`,
      ),
    );

  const [topProduct] = await db
    .select({
      productId: saleItems.productId,
      name: saleItems.productNameSnapshot,
      units: sql<number>`SUM(${saleItems.quantity})::int`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, startMonth), lt(sales.createdAt, nextMonth), branchCond))
    .groupBy(saleItems.productId, saleItems.productNameSnapshot)
    .orderBy(desc(sql`SUM(${saleItems.quantity})`))
    .limit(1);

  return {
    avgTicket: Number(avgRow?.avgTicket || 0),
    staleProducts60d: Number(staleRow?.count || 0),
    topProductMonth: topProduct
      ? {
          productId: Number(topProduct.productId),
          name: String(topProduct.name || "Producto"),
          units: Number(topProduct.units || 0),
        }
      : null,
  };
}
