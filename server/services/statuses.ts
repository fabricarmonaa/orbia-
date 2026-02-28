import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { statusDefinitions, orderStatuses, orders, products } from "@shared/schema";
import { DELIVERY_STATUS } from "../utils/status-codes";

export type StatusEntityType = "ORDER" | "PRODUCT" | "DELIVERY";


export function normalizeDeliveryStatus(input?: string | null) {
  const code = normalizeStatusCode(input || DELIVERY_STATUS.PENDING);
  return (DELIVERY_STATUS as Record<string, string>)[code] || DELIVERY_STATUS.PENDING;
}

export async function resolveCanonicalOrderStatusId(params: { tenantId: number; statusId?: number | null; statusCode?: string | null }) {
  if (params.statusCode) {
    const normalizedCode = normalizeStatusCode(params.statusCode);
    await ensureStatusExists(params.tenantId, "ORDER", normalizedCode);
    return await resolveOrderStatusIdByCode(params.tenantId, normalizedCode);
  }

  if (params.statusId) {
    const [legacy] = await db.select().from(orderStatuses).where(and(eq(orderStatuses.id, params.statusId), eq(orderStatuses.tenantId, params.tenantId))).limit(1);
    if (!legacy) return null;
    const normalizedLegacyCode = normalizeStatusCode(legacy.name || "");
    const canonical = await ensureStatusExists(params.tenantId, "ORDER", normalizedLegacyCode);
    return await resolveOrderStatusIdByCode(params.tenantId, canonical.code);
  }

  return null;
}

export function normalizeStatusCode(input: string) {
  return (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function getStatuses(tenantId: number, entityType: StatusEntityType, includeInactive = false) {
  const rows = await db
    .select()
    .from(statusDefinitions)
    .where(and(eq(statusDefinitions.tenantId, tenantId), eq(statusDefinitions.entityType, entityType)))
    .orderBy(asc(statusDefinitions.sortOrder), asc(statusDefinitions.id));

  return includeInactive ? rows : rows.filter((s) => s.isActive);
}

export async function getDefaultStatus(tenantId: number, entityType: StatusEntityType) {
  const [row] = await db
    .select()
    .from(statusDefinitions)
    .where(and(
      eq(statusDefinitions.tenantId, tenantId),
      eq(statusDefinitions.entityType, entityType),
      eq(statusDefinitions.isDefault, true),
      eq(statusDefinitions.isActive, true),
    ));
  return row;
}

export async function ensureStatusExists(tenantId: number, entityType: StatusEntityType, code: string) {
  const normalized = normalizeStatusCode(code);
  const [row] = await db
    .select()
    .from(statusDefinitions)
    .where(and(
      eq(statusDefinitions.tenantId, tenantId),
      eq(statusDefinitions.entityType, entityType),
      eq(statusDefinitions.code, normalized),
      eq(statusDefinitions.isActive, true),
    ));
  if (!row) throw new Error("STATUS_NOT_FOUND");
  return row;
}

export async function resolveOrderStatusIdByCode(tenantId: number, code: string) {
  const status = await ensureStatusExists(tenantId, "ORDER", code);
  const [orderStatus] = await db
    .select()
    .from(orderStatuses)
    .where(and(eq(orderStatuses.tenantId, tenantId), sql`LEFT(REGEXP_REPLACE(UPPER(${orderStatuses.name}), '[^A-Z0-9]+', '_', 'g'), 40) = ${status.code}`));
  return orderStatus?.id ?? null;
}

export async function getStatusUsageCount(tenantId: number, entityType: StatusEntityType, code: string) {
  if (entityType === "PRODUCT") {
    const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.statusCode, code)));
    return Number(r?.c || 0);
  }
  if (entityType === "DELIVERY") {
    const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.deliveryStatus, code.toLowerCase())));
    return Number(r?.c || 0);
  }
  const statusId = await resolveOrderStatusIdByCode(tenantId, code);
  if (!statusId) return 0;
  const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.statusId, statusId)));
  return Number(r?.c || 0);
}

export async function mergeStatus(tenantId: number, entityType: StatusEntityType, oldCode: string, newCode: string) {
  if (entityType === "PRODUCT") {
    await db.update(products).set({ statusCode: newCode }).where(and(eq(products.tenantId, tenantId), eq(products.statusCode, oldCode)));
  } else if (entityType === "DELIVERY") {
    await db.update(orders).set({ deliveryStatus: newCode.toLowerCase() }).where(and(eq(orders.tenantId, tenantId), eq(orders.deliveryStatus, oldCode.toLowerCase())));
  } else {
    const oldId = await resolveOrderStatusIdByCode(tenantId, oldCode);
    const newId = await resolveOrderStatusIdByCode(tenantId, newCode);
    if (oldId && newId) {
      await db.update(orders).set({ statusId: newId }).where(and(eq(orders.tenantId, tenantId), eq(orders.statusId, oldId)));
    }
  }
}

export async function reorderStatuses(tenantId: number, entityType: StatusEntityType, ids: number[]) {
  const rows = await db.select({ id: statusDefinitions.id }).from(statusDefinitions).where(and(eq(statusDefinitions.tenantId, tenantId), eq(statusDefinitions.entityType, entityType), inArray(statusDefinitions.id, ids)));
  const set = new Set(rows.map((r) => r.id));
  for (let i = 0; i < ids.length; i++) {
    if (!set.has(ids[i])) continue;
    await db.update(statusDefinitions).set({ sortOrder: i + 1, updatedAt: new Date() }).where(eq(statusDefinitions.id, ids[i]));
  }
}
