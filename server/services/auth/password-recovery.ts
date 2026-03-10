import crypto from "crypto";
import { pool } from "../../db";

const TOKEN_TTL_MIN = Math.max(5, parseInt(process.env.PASSWORD_RESET_TTL_MIN || "20", 10));

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(input: { userId: number; tenantId?: number | null; email: string; requestedIp?: string | null }) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60_000);

  await pool.query(
    `UPDATE password_reset_tokens SET revoked = true WHERE user_id = $1 AND used_at IS NULL AND revoked = false`,
    [input.userId],
  );

  await pool.query(
    `
    INSERT INTO password_reset_tokens (tenant_id, user_id, email, token_hash, expires_at, requested_ip)
    VALUES ($1,$2,$3,$4,$5,$6)
  `,
    [input.tenantId || null, input.userId, input.email.toLowerCase(), tokenHash, expiresAt, input.requestedIp || null],
  );

  return { token: rawToken, expiresAt };
}

export async function validatePasswordResetToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const row = (await pool.query(
    `
    SELECT id, user_id, tenant_id, email, expires_at, used_at, revoked
    FROM password_reset_tokens
    WHERE token_hash = $1
    ORDER BY created_at DESC
    LIMIT 1
  `,
    [tokenHash],
  )).rows[0] as any;

  if (!row) return null;
  if (row.revoked) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  return {
    tokenId: Number(row.id),
    userId: Number(row.user_id),
    tenantId: row.tenant_id ? Number(row.tenant_id) : null,
    email: String(row.email),
    expiresAt: new Date(row.expires_at),
  };
}

export async function consumePasswordResetToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const valid = await validatePasswordResetToken(rawToken);
  if (!valid) return null;

  await pool.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [valid.tokenId]);
  await pool.query(`UPDATE password_reset_tokens SET revoked = true WHERE user_id = $1 AND id <> $2 AND used_at IS NULL`, [valid.userId, valid.tokenId]);
  return valid;
}
