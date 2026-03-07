import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { products, saleItems, sales } from "@shared/schema";

export type DashboardAnalytics = {
  avgTicket: number;
  avgTicketVariation: number;
  collectionEfficiency: { paid: number; unpaid: number };
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

  // Calculo de Ticket Promedio para periodo actual vs previo (Quincena = 15 dias)
  const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [currentAvgRow] = await db
    .select({ avgTicket: sql<number>`COALESCE(AVG(${sales.totalAmount}), 0)` })
    .from(sales)
    .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, fifteenDaysAgo), branchCond));

  const [pastAvgRow] = await db
    .select({ avgTicket: sql<number>`COALESCE(AVG(${sales.totalAmount}), 0)` })
    .from(sales)
    .where(and(eq(sales.tenantId, tenantId), gte(sales.createdAt, thirtyDaysAgo), lt(sales.createdAt, fifteenDaysAgo), branchCond));

  const currentAvg = Number(currentAvgRow?.avgTicket || 0);
  const pastAvg = Number(pastAvgRow?.avgTicket || 0);
  const avgTicketVariation = pastAvg > 0 ? ((currentAvg - pastAvg) / pastAvg) * 100 : (currentAvg > 0 ? 100 : 0);

  // Eficiencia de Cobro (Pedidos activos)
  const [collectionRow] = await db
    .select({
      totalActiveValue: sql<number>`COALESCE(SUM(${sql.raw('orders.total_amount')}), 0)`,
      totalActivePaid: sql<number>`COALESCE(SUM(${sql.raw('orders.paid_amount')}), 0)`
    })
    .from(sql.raw('orders'))
    .innerJoin(sql.raw('order_statuses'), sql.raw('orders.status_id = order_statuses.id'))
    .where(sql.raw(`orders.tenant_id = ${tenantId} AND order_statuses.is_final = false ${branchId ? `AND orders.branch_id = ${branchId}` : ''}`));

  const paid = Number(collectionRow?.totalActivePaid || 0);
  const totalValue = Number(collectionRow?.totalActiveValue || 0);
  const unpaid = Math.max(0, totalValue - paid);

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
    avgTicket: currentAvg,
    avgTicketVariation: Math.round(avgTicketVariation),
    collectionEfficiency: { paid, unpaid },
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
