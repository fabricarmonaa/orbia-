import crypto from "crypto";
import { pool } from "../../db";

const FORGOT_HINT_THRESHOLD = 3;
const LOCK_THRESHOLD = 5;
const LOCK_MS = 60_000;

export type LoginAttemptState = {
  failedCount: number;
  lockedUntil: Date | null;
};

export function buildLoginFingerprint(input: { tenantCode: string; email: string; userId?: number | null; ip: string }) {
  const raw = `${input.tenantCode.toLowerCase()}|${input.email.toLowerCase()}|${input.userId || 0}|${input.ip}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function getLoginAttemptState(fingerprint: string): Promise<LoginAttemptState> {
  const row = (await pool.query(
    `SELECT failed_count, lock_until FROM auth_login_attempts WHERE fingerprint = $1 ORDER BY id DESC LIMIT 1`,
    [fingerprint],
  )).rows[0] as { failed_count?: number; lock_until?: string | null } | undefined;

  const failedCount = Number(row?.failed_count || 0);
  const lockedUntil = row?.lock_until ? new Date(row.lock_until) : null;

  if (lockedUntil && lockedUntil.getTime() <= Date.now()) {
    await clearLoginAttempts(fingerprint);
    return { failedCount: 0, lockedUntil: null };
  }

  return { failedCount, lockedUntil };
}

export async function registerFailedLoginAttempt(input: {
  fingerprint: string;
  tenantId?: number | null;
  tenantCode: string;
  userId?: number | null;
  email: string;
  ip: string;
}) {
  const current = await getLoginAttemptState(input.fingerprint);
  const nextCount = current.failedCount + 1;
  const shouldLock = nextCount >= LOCK_THRESHOLD;
  const lockUntil = shouldLock ? new Date(Date.now() + LOCK_MS) : null;

  await pool.query(
    `
    INSERT INTO auth_login_attempts
      (tenant_id, tenant_code, user_id, email, ip, fingerprint, failed_count, first_failed_at, last_failed_at, lock_until, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now(),$8,now())
    ON CONFLICT (fingerprint) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      tenant_code = EXCLUDED.tenant_code,
      user_id = EXCLUDED.user_id,
      email = EXCLUDED.email,
      ip = EXCLUDED.ip,
      failed_count = EXCLUDED.failed_count,
      last_failed_at = now(),
      lock_until = EXCLUDED.lock_until,
      updated_at = now()
  `,
    [input.tenantId || null, input.tenantCode, input.userId || null, input.email.toLowerCase(), input.ip, input.fingerprint, nextCount, lockUntil],
  );

  return {
    failedCount: nextCount,
    showForgotPassword: nextCount >= FORGOT_HINT_THRESHOLD,
    lockUntil,
    lockedSeconds: lockUntil ? Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 1000)) : 0,
  };
}

export async function clearLoginAttempts(fingerprint: string) {
  await pool.query(`DELETE FROM auth_login_attempts WHERE fingerprint = $1`, [fingerprint]);
}

export function loginHintFromState(state: LoginAttemptState) {
  const lockedSeconds = state.lockedUntil ? Math.max(1, Math.ceil((state.lockedUntil.getTime() - Date.now()) / 1000)) : 0;
  return {
    failedCount: state.failedCount,
    showForgotPassword: state.failedCount >= FORGOT_HINT_THRESHOLD,
    lockedSeconds,
  };
}
