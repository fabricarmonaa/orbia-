import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { idempotencyKeys } from "@shared/schema";

export function getIdempotencyKey(raw?: string | string[]) {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

export function hashPayload(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}

export async function getIdempotentResponse(tenantId: number, userId: number, key: string, route: string, requestHash: string) {
  const rows = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.tenantId, tenantId),
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.key, key),
        eq(idempotencyKeys.route, route)
      )
    )
    .limit(1);

  const existing = rows[0];
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    throw new Error("IDEMPOTENCY_HASH_MISMATCH");
  }
  return {
    status: existing.responseStatus,
    body: existing.responseBody,
  };
}

export async function saveIdempotentResponse(args: {
  tenantId: number;
  userId: number;
  key: string;
  route: string;
  requestHash: string;
  status: number;
  body: unknown;
}) {
  await db
    .insert(idempotencyKeys)
    .values({
      tenantId: args.tenantId,
      userId: args.userId,
      key: args.key,
      route: args.route,
      requestHash: args.requestHash,
      responseStatus: args.status,
      responseBody: args.body as any,
    })
    .onConflictDoUpdate({
      target: [idempotencyKeys.tenantId, idempotencyKeys.userId, idempotencyKeys.key, idempotencyKeys.route],
      set: {
        requestHash: args.requestHash,
        responseStatus: args.status,
        responseBody: args.body as any,
      },
    });
}
