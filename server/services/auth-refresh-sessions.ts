import crypto from "crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { authRefreshSessions } from "@shared/schema";
import { db } from "../db";

const REFRESH_COOKIE_NAME = "orbia_refresh";
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS || 60 * 60 * 2);
const REFRESH_SHORT_TTL_DAYS = Number(process.env.AUTH_REFRESH_SHORT_TTL_DAYS || 3);
// 90 días: con sliding window (touchRefreshSession renueva en cada uso), 90 días es
// suficientemente cómodo para el usuario y suficientemente seguro.
// Antes era 3650 (10 años). Configurable via AUTH_REFRESH_REMEMBER_TTL_DAYS.
const REFRESH_REMEMBER_TTL_DAYS = Number(process.env.AUTH_REFRESH_REMEMBER_TTL_DAYS || 90);

export function getAccessTokenTtlSeconds() {
  return ACCESS_TOKEN_TTL_SECONDS;
}

export function getRefreshCookieName() {
  return REFRESH_COOKIE_NAME;
}

export function buildRefreshTokenValue() {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getRefreshSessionExpiry(rememberDevice: boolean, now = new Date()) {
  const next = new Date(now);
  next.setDate(next.getDate() + (rememberDevice ? REFRESH_REMEMBER_TTL_DAYS : REFRESH_SHORT_TTL_DAYS));
  return next;
}

export function serializeRefreshCookie(token: string, expiresAt: Date) {
  const secure = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const parts = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearRefreshCookie() {
  const secure = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const parts = [
    `${REFRESH_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(header: string | undefined, name: string) {
  const cookieHeader = String(header || "");
  for (const pair of cookieHeader.split(";")) {
    const [rawKey, ...rest] = pair.trim().split("=");
    if (!rawKey || rawKey !== name) continue;
    return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function createRefreshSession(input: {
  tenantId: number;
  userId: number;
  rememberDevice: boolean;
  deviceLabel?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const token = buildRefreshTokenValue();
  const expiresAt = getRefreshSessionExpiry(input.rememberDevice);
  const [session] = await db.insert(authRefreshSessions).values({
    tenantId: input.tenantId,
    userId: input.userId,
    tokenHash: hashRefreshToken(token),
    deviceLabel: input.deviceLabel || null,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    rememberDevice: input.rememberDevice,
    expiresAt,
    revokedAt: null,
  }).returning();
  return { session, token, expiresAt };
}

export async function getRefreshSessionByToken(token: string) {
  const tokenHash = hashRefreshToken(token);
  const [session] = await db.select().from(authRefreshSessions).where(eq(authRefreshSessions.tokenHash, tokenHash)).limit(1);
  return session || null;
}

export async function touchRefreshSession(id: number) {
  const [current] = await db.select().from(authRefreshSessions).where(eq(authRefreshSessions.id, id)).limit(1);
  if (!current) return null;
  const nextExpiresAt = current.rememberDevice
    ? getRefreshSessionExpiry(true)
    : current.expiresAt;
  const [session] = await db
    .update(authRefreshSessions)
    .set({ lastSeenAt: new Date(), expiresAt: nextExpiresAt })
    .where(eq(authRefreshSessions.id, id))
    .returning();
  return session || null;
}

export async function revokeRefreshSession(id: number, replacedBySessionId?: number | null) {
  const [session] = await db
    .update(authRefreshSessions)
    .set({ revokedAt: new Date(), replacedBySessionId: replacedBySessionId || null })
    .where(and(eq(authRefreshSessions.id, id), isNull(authRefreshSessions.revokedAt)))
    .returning();
  return session || null;
}

export async function revokeRefreshSessionsForUser(tenantId: number, userId: number) {
  await db
    .update(authRefreshSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authRefreshSessions.tenantId, tenantId), eq(authRefreshSessions.userId, userId), isNull(authRefreshSessions.revokedAt)));
}

export async function cleanupExpiredRefreshSessions() {
  await db
    .update(authRefreshSessions)
    .set({ revokedAt: new Date() })
    .where(and(or(isNull(authRefreshSessions.revokedAt), lt(authRefreshSessions.revokedAt, authRefreshSessions.createdAt)), lt(authRefreshSessions.expiresAt, new Date())));
}

export function isRefreshSessionUsable(session: { revokedAt: Date | null; expiresAt: Date; }) {
  return !session.revokedAt && session.expiresAt.getTime() > Date.now();
}
