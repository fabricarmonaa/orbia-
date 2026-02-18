import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  cashMovements,
  orders,
  orderStatuses,
  tenantDailyMetrics,
  tenantMonthlyMetrics,
} from "@shared/schema";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function refreshTenantMetrics(tenantId: number, range?: { from?: string | Date; to?: string | Date }) {
  const fromDate = range?.from ? new Date(range.from) : new Date();
  const toDate = range?.to ? new Date(range.to) : fromDate;

  const from = startOfDay(fromDate);
  const to = endOfDay(toDate);

  const [dailyOrderRow] = await db
    .select({
      ordersCount: sql<number>`COUNT(*)::int`,
      revenueTotal: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      ordersCancelledCount: sql<number>`COUNT(*) FILTER (WHERE LOWER(COALESCE(${orderStatuses.name}, '')) LIKE '%cancel%')::int`,
    })
    .from(orders)
    .leftJoin(orderStatuses, and(eq(orderStatuses.id, orders.statusId), eq(orderStatuses.tenantId, tenantId)))
    .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, from), lte(orders.createdAt, to)));

  const [dailyCashRow] = await db
    .select({
      cashInTotal: sql<string>`COALESCE(SUM(CASE WHEN ${cashMovements.type} = 'ingreso' THEN ${cashMovements.amount} ELSE 0 END), 0)`,
      cashOutTotal: sql<string>`COALESCE(SUM(CASE WHEN ${cashMovements.type} = 'egreso' THEN ${cashMovements.amount} ELSE 0 END), 0)`,
    })
    .from(cashMovements)
    .where(and(eq(cashMovements.tenantId, tenantId), gte(cashMovements.createdAt, from), lte(cashMovements.createdAt, to)));

  const dayKey = from.toISOString().slice(0, 10);
  await db
    .insert(tenantDailyMetrics)
    .values({
      tenantId,
      day: dayKey,
      ordersCount: dailyOrderRow?.ordersCount || 0,
      revenueTotal: String(dailyOrderRow?.revenueTotal || "0"),
      ordersCancelledCount: dailyOrderRow?.ordersCancelledCount || 0,
      cashInTotal: String(dailyCashRow?.cashInTotal || "0"),
      cashOutTotal: String(dailyCashRow?.cashOutTotal || "0"),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantDailyMetrics.tenantId, tenantDailyMetrics.day],
      set: {
        ordersCount: dailyOrderRow?.ordersCount || 0,
        revenueTotal: String(dailyOrderRow?.revenueTotal || "0"),
        ordersCancelledCount: dailyOrderRow?.ordersCancelledCount || 0,
        cashInTotal: String(dailyCashRow?.cashInTotal || "0"),
        cashOutTotal: String(dailyCashRow?.cashOutTotal || "0"),
        updatedAt: new Date(),
      },
    });

  const monthFrom = startOfMonth(from);
  const monthTo = endOfDay(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)));

  const [monthlyOrderRow] = await db
    .select({
      ordersCount: sql<number>`COUNT(*)::int`,
      revenueTotal: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      ordersCancelledCount: sql<number>`COUNT(*) FILTER (WHERE LOWER(COALESCE(${orderStatuses.name}, '')) LIKE '%cancel%')::int`,
    })
    .from(orders)
    .leftJoin(orderStatuses, and(eq(orderStatuses.id, orders.statusId), eq(orderStatuses.tenantId, tenantId)))
    .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, monthFrom), lte(orders.createdAt, monthTo)));

  const [monthlyCashRow] = await db
    .select({
      cashInTotal: sql<string>`COALESCE(SUM(CASE WHEN ${cashMovements.type} = 'ingreso' THEN ${cashMovements.amount} ELSE 0 END), 0)`,
      cashOutTotal: sql<string>`COALESCE(SUM(CASE WHEN ${cashMovements.type} = 'egreso' THEN ${cashMovements.amount} ELSE 0 END), 0)`,
    })
    .from(cashMovements)
    .where(and(eq(cashMovements.tenantId, tenantId), gte(cashMovements.createdAt, monthFrom), lte(cashMovements.createdAt, monthTo)));

  const monthKey = monthFrom.toISOString().slice(0, 10);
  await db
    .insert(tenantMonthlyMetrics)
    .values({
      tenantId,
      month: monthKey,
      ordersCount: monthlyOrderRow?.ordersCount || 0,
      revenueTotal: String(monthlyOrderRow?.revenueTotal || "0"),
      ordersCancelledCount: monthlyOrderRow?.ordersCancelledCount || 0,
      cashInTotal: String(monthlyCashRow?.cashInTotal || "0"),
      cashOutTotal: String(monthlyCashRow?.cashOutTotal || "0"),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantMonthlyMetrics.tenantId, tenantMonthlyMetrics.month],
      set: {
        ordersCount: monthlyOrderRow?.ordersCount || 0,
        revenueTotal: String(monthlyOrderRow?.revenueTotal || "0"),
        ordersCancelledCount: monthlyOrderRow?.ordersCancelledCount || 0,
        cashInTotal: String(monthlyCashRow?.cashInTotal || "0"),
        cashOutTotal: String(monthlyCashRow?.cashOutTotal || "0"),
        updatedAt: new Date(),
      },
    });
}

export async function refreshMetricsForDate(tenantId: number, date: Date = new Date()) {
  await refreshTenantMetrics(tenantId, { from: date, to: date });
}

export async function getTenantMonthlyMetricsSummary(tenantId: number, month?: Date) {
  const target = startOfMonth(month || new Date()).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(tenantMonthlyMetrics)
    .where(and(eq(tenantMonthlyMetrics.tenantId, tenantId), eq(tenantMonthlyMetrics.month, target)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      month: target,
      ordersCount: 0,
      revenueTotal: 0,
      ordersCancelledCount: 0,
      cashInTotal: 0,
      cashOutTotal: 0,
    };
  }

  return {
    month: target,
    ordersCount: row.ordersCount || 0,
    revenueTotal: Number(row.revenueTotal || 0),
    ordersCancelledCount: row.ordersCancelledCount || 0,
    cashInTotal: Number(row.cashInTotal || 0),
    cashOutTotal: Number(row.cashOutTotal || 0),
  };
}
