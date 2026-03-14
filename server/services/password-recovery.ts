import crypto from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { passwordResetTokens, users } from "@shared/schema";

const DEFAULT_TTL_MINUTES = parseInt(process.env.PASSWORD_RESET_TTL_MINUTES || "60", 10);

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildPasswordResetUrl(token: string) {
  const base = (process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || "").trim().replace(/\/$/, "") || "http://localhost:5000";
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function issuePasswordResetToken(userId: number, requestMeta?: { ip?: string; userAgent?: string | null }) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const ttlMinutes = Number.isFinite(DEFAULT_TTL_MINUTES) && DEFAULT_TTL_MINUTES > 0 ? DEFAULT_TTL_MINUTES : 60;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt,
    requestedByIp: requestMeta?.ip || null,
    requestedByUserAgent: requestMeta?.userAgent ? String(requestMeta.userAgent).slice(0, 300) : null,
  });

  return { rawToken, expiresAt };
}

export async function validatePasswordResetToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const rows = await db
    .select({
      tokenId: passwordResetTokens.id,
      userId: users.id,
      tenantId: users.tenantId,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      scope: users.scope,
      branchId: users.branchId,
      isActive: users.isActive,
      deletedAt: users.deletedAt,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, now), isNull(passwordResetTokens.usedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (!row.isActive || row.deletedAt || row.tenantId == null) return null;

  return row;
}

export async function consumePasswordResetToken(tokenId: number) {
  const now = new Date();
  const result = await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(and(eq(passwordResetTokens.id, tokenId), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now)))
    .returning({ id: passwordResetTokens.id });
  return result.length > 0;
}

export async function cleanupExpiredPasswordResetTokens() {
  await db
    .delete(passwordResetTokens)
    .where(sql`${passwordResetTokens.expiresAt} < NOW() - interval '7 days'`);
}
