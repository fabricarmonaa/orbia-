/**
 * Etapa 4 – Metrics service
 *
 * Updates tenant_daily_metrics and tenant_monthly_metrics using UPSERT increments.
 * All calls should be fire-and-forget (Promise.catch(warn)) so metrics never block
 * the main request. The DB UPSERT is atomic — no file locks, race conditions,
 * or cross-instance inconsistency issues.
 */

import { db } from "../db";
import { sql, and, eq } from "drizzle-orm";
import { tenantDailyMetrics, tenantMonthlyMetrics } from "@shared/schema";

export interface MetricsDelta {
    ordersCount?: number;
    revenueTotal?: number;
    ordersCancelledCount?: number;
    cashInTotal?: number;
    cashOutTotal?: number;
}

function toDateString(d: Date): string {
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function toMonthString(d: Date): string {
    return d.toISOString().substring(0, 7) + "-01"; // YYYY-MM-01 (first of month — matches date column)
}

/**
 * Increment daily metrics for a tenant.
 * Call fire-and-forget: updateDailyMetrics(...).catch(err => console.warn(err))
 */
export async function updateDailyMetrics(
    tenantId: number,
    date: Date,
    delta: MetricsDelta
): Promise<void> {
    if (Object.keys(delta).length === 0) return;
    const day = toDateString(date);

    // Build initial row values (for INSERT case)
    const initRow = {
        tenantId,
        day,
        ordersCount: delta.ordersCount ?? 0,
        revenueTotal: String(delta.revenueTotal ?? 0),
        ordersCancelledCount: delta.ordersCancelledCount ?? 0,
        cashInTotal: String(delta.cashInTotal ?? 0),
        cashOutTotal: String(delta.cashOutTotal ?? 0),
    };

    // Build SET clause for UPDATE case (add increments to existing values)
    const setClause: Record<string, unknown> = { updatedAt: new Date() };
    if (delta.ordersCount) setClause.ordersCount = sql`${tenantDailyMetrics.ordersCount} + ${delta.ordersCount}`;
    if (delta.revenueTotal) setClause.revenueTotal = sql`${tenantDailyMetrics.revenueTotal}::numeric + ${delta.revenueTotal}`;
    if (delta.ordersCancelledCount) setClause.ordersCancelledCount = sql`${tenantDailyMetrics.ordersCancelledCount} + ${delta.ordersCancelledCount}`;
    if (delta.cashInTotal) setClause.cashInTotal = sql`${tenantDailyMetrics.cashInTotal}::numeric + ${delta.cashInTotal}`;
    if (delta.cashOutTotal) setClause.cashOutTotal = sql`${tenantDailyMetrics.cashOutTotal}::numeric + ${delta.cashOutTotal}`;

    await db
        .insert(tenantDailyMetrics)
        .values(initRow)
        .onConflictDoUpdate({
            target: [tenantDailyMetrics.tenantId, tenantDailyMetrics.day],
            set: setClause,
        });
}

/**
 * Increment monthly metrics for a tenant.
 * Call fire-and-forget: updateMonthlyMetrics(...).catch(err => console.warn(err))
 */
export async function updateMonthlyMetrics(
    tenantId: number,
    date: Date,
    delta: MetricsDelta
): Promise<void> {
    if (Object.keys(delta).length === 0) return;
    const month = toMonthString(date);

    const initRow = {
        tenantId,
        month,
        ordersCount: delta.ordersCount ?? 0,
        revenueTotal: String(delta.revenueTotal ?? 0),
        ordersCancelledCount: delta.ordersCancelledCount ?? 0,
        cashInTotal: String(delta.cashInTotal ?? 0),
        cashOutTotal: String(delta.cashOutTotal ?? 0),
    };

    const setClause: Record<string, unknown> = { updatedAt: new Date() };
    if (delta.ordersCount) setClause.ordersCount = sql`${tenantMonthlyMetrics.ordersCount} + ${delta.ordersCount}`;
    if (delta.revenueTotal) setClause.revenueTotal = sql`${tenantMonthlyMetrics.revenueTotal}::numeric + ${delta.revenueTotal}`;
    if (delta.ordersCancelledCount) setClause.ordersCancelledCount = sql`${tenantMonthlyMetrics.ordersCancelledCount} + ${delta.ordersCancelledCount}`;
    if (delta.cashInTotal) setClause.cashInTotal = sql`${tenantMonthlyMetrics.cashInTotal}::numeric + ${delta.cashInTotal}`;
    if (delta.cashOutTotal) setClause.cashOutTotal = sql`${tenantMonthlyMetrics.cashOutTotal}::numeric + ${delta.cashOutTotal}`;

    await db
        .insert(tenantMonthlyMetrics)
        .values(initRow)
        .onConflictDoUpdate({
            target: [tenantMonthlyMetrics.tenantId, tenantMonthlyMetrics.month],
            set: setClause,
        });
}

/**
 * Convenience: update both daily and monthly in one call.
 * Always fire-and-forget from callers.
 */
export function bumpMetrics(tenantId: number, delta: MetricsDelta): void {
    const now = new Date();
    updateDailyMetrics(tenantId, now, delta).catch((err) =>
        console.warn("[metrics] daily update failed:", err?.message)
    );
    updateMonthlyMetrics(tenantId, now, delta).catch((err) =>
        console.warn("[metrics] monthly update failed:", err?.message)
    );
}
