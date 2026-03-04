import type { Request } from "express";
import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { auditEvents, cashiers, users } from "@shared/schema";
import { db } from "../db";

interface AuditEventInput {
  tenantId: number;
  branchId?: number | null;
  actorUserId?: number | null;
  actorCashierId?: number | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

function resolveIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || req.ip || null;
  return req.ip || null;
}

export function buildAuditContext(req: Request) {
  const auth = req.auth;
  return {
    tenantId: auth?.tenantId || 0,
    branchId: auth?.branchId || null,
    actorUserId: auth?.userId || null,
    actorCashierId: auth?.cashierId || null,
    actorRole: auth?.role || "sistema",
    ip: resolveIp(req),
    userAgent: req.get("user-agent") || null,
  };
}

export async function logAuditEvent(input: AuditEventInput) {
  try {
    if (!input.tenantId) return;
    await db.insert(auditEvents).values({
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorCashierId: input.actorCashierId ?? null,
      actorRole: input.actorRole || "sistema",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId == null ? null : String(input.entityId),
      metadata: input.metadata || {},
      ip: input.ip || null,
      userAgent: input.userAgent || null,
    });
  } catch (error) {
    console.error("[audit] AUDIT_LOG_ERROR", error);
  }
}

export function logAuditEventFromRequest(req: Request, payload: Omit<AuditEventInput, "tenantId" | "branchId" | "actorUserId" | "actorCashierId" | "actorRole" | "ip" | "userAgent">) {
  const ctx = buildAuditContext(req);
  void logAuditEvent({ ...ctx, ...payload });
}

export async function listAuditEvents(tenantId: number, filters: {
  from?: Date;
  to?: Date;
  entityType?: string;
  action?: string;
  branchId?: number;
  actorUserId?: number;
  actorCashierId?: number;
  page: number;
  pageSize: number;
}) {
  const conditions = [eq(auditEvents.tenantId, tenantId)];
  if (filters.from) conditions.push(gte(auditEvents.createdAt, filters.from));
  if (filters.to) conditions.push(lte(auditEvents.createdAt, filters.to));
  if (filters.entityType) conditions.push(eq(auditEvents.entityType, filters.entityType));
  if (filters.action) conditions.push(eq(auditEvents.action, filters.action));
  if (filters.branchId) conditions.push(eq(auditEvents.branchId, filters.branchId));
  if (filters.actorUserId) conditions.push(eq(auditEvents.actorUserId, filters.actorUserId));
  if (filters.actorCashierId) conditions.push(eq(auditEvents.actorCashierId, filters.actorCashierId));

  const where = and(...conditions);
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows, totalRows] = await Promise.all([
    db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt)).limit(filters.pageSize).offset(offset),
    db.select({ total: count() }).from(auditEvents).where(where),
  ]);

  const userIds = Array.from(new Set(rows.map((row) => row.actorUserId).filter((id): id is number => typeof id === "number")));
  const cashierIds = Array.from(new Set(rows.map((row) => row.actorCashierId).filter((id): id is number => typeof id === "number")));

  const [userRows, cashierRows] = await Promise.all([
    userIds.length ? db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds))) : Promise.resolve([]),
    cashierIds.length ? db.select({ id: cashiers.id, name: cashiers.name }).from(cashiers).where(and(eq(cashiers.tenantId, tenantId), inArray(cashiers.id, cashierIds))) : Promise.resolve([]),
  ]);

  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const cashierMap = new Map(cashierRows.map((c) => [c.id, c]));

  return {
    data: rows.map((row) => ({
      ...row,
      actorUser: row.actorUserId ? userMap.get(row.actorUserId) || null : null,
      actorCashier: row.actorCashierId ? cashierMap.get(row.actorCashierId) || null : null,
      summary: `${row.action} · ${row.entityType}`,
    })),
    page: filters.page,
    pageSize: filters.pageSize,
    total: Number(totalRows[0]?.total || 0),
  };
}
