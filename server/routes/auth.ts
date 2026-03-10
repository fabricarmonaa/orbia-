import type { Express, Request } from "express";
import { storage } from "../storage";
import { z } from "zod";
import {
  generateToken,
  comparePassword,
  verifyToken,
  isIpAllowedForSuperAdmin,
  getClientIp,
  tenantAuth,
  hashPassword,
} from "../auth";
import { createRateLimiter } from "../middleware/rate-limit";
import { strictLoginLimiter } from "../middleware/http-rate-limit";
import { db } from "../db";
import { superAdminAuditLogs, superAdminTotp } from "@shared/schema";
import { eq } from "drizzle-orm";
import { verify as verifyTotp } from "otplib";
import { sanitizeShortText } from "../security/sanitize";
import { evaluatePassword } from "../services/password-policy";
import { setPasswordWeakFlag } from "../services/password-weak-cache";
import { buildLoginFingerprint, clearLoginAttempts, getLoginAttemptState, loginHintFromState, registerFailedLoginAttempt } from "../services/auth/login-security";
import { consumePasswordResetToken, createPasswordResetToken, validatePasswordResetToken } from "../services/auth/password-recovery";
import { sendMail } from "../services/mailer/gmailMailer";
import { renderPasswordResetTemplate } from "../services/mailer/templates/password-reset";

type LockState = { failures: number; firstFailureAt: number; lockedUntil?: number };
const superLoginByIp = new Map<string, LockState>();
const superLoginByEmail = new Map<string, LockState>();

const superMaxAttempts = parseInt(process.env.SUPERADMIN_MAX_ATTEMPTS || "6", 10);
const superWindowMs = parseInt(process.env.SUPERADMIN_WINDOW_MS || String(15 * 60 * 1000), 10);
const superLockMs = parseInt(process.env.SUPERADMIN_LOCK_MS || String(15 * 60 * 1000), 10);

const superLoginSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(1).max(256),
  totpCode: z.string().trim().min(6).max(8).optional(),
});

const tenantLoginSchema = z.object({
  tenantCode: z.string().transform((value) => sanitizeShortText(value, 40)).refine((value) => value.length >= 2, "Código inválido"),
  email: z.string().trim().email().max(120),
  userId: z.coerce.number().int().positive().optional(),
  password: z.string().min(1).max(256),
});

const passwordRecoveryRequestSchema = z.object({
  tenantCode: z.string().transform((value) => sanitizeShortText(value, 40)).refine((value) => value.length >= 2, "Código inválido"),
  email: z.string().trim().email().max(120),
  userId: z.coerce.number().int().positive(),
});

const passwordRecoveryResetSchema = z.object({
  token: z.string().trim().min(20).max(512),
  newPassword: z.string().min(6).max(256),
});

const superLoginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.AUTH_SUPER_LOGIN_LIMIT || "10", 10),
  keyGenerator: (req) => `super-login:${req.ip}`,
  errorMessage: "Demasiados intentos. Intentá nuevamente en unos minutos.",
  code: "RATE_LIMITED",
  onLimit: ({ req, retryAfterSec }) => {
    void logSuperSecurity(null, "brute_force_blocked", { route: "/api/auth/super/login", ip: getClientIp(req), retryAfterSec });
  },
});

const tenantLoginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.AUTH_LOGIN_LIMIT || "10", 10),
  keyGenerator: (req) => `tenant-login:${req.ip}:${String(req.body?.tenantCode || "").toLowerCase()}`,
  errorMessage: "Demasiados intentos. Intentá nuevamente en unos minutos.",
  code: "RATE_LIMITED",
  onLimit: async ({ req, retryAfterSec }) => {
    const tenantCode = String(req.body?.tenantCode || "").trim();
    if (!tenantCode) return;
    const tenant = await storage.getTenantByCode(tenantCode).catch(() => undefined);
    if (!tenant) return;
    await storage.createAuditLog({
      tenantId: tenant.id,
      userId: null,
      action: "brute_force_blocked",
      entityType: "auth",
      metadata: { route: "/api/auth/login", ip: req.ip, retryAfterSec },
    }).catch(() => undefined);
  },
});

function markFailure(map: Map<string, LockState>, key: string) {
  const now = Date.now();
  const current = map.get(key);
  if (!current || now - current.firstFailureAt > superWindowMs) {
    map.set(key, { failures: 1, firstFailureAt: now });
    return;
  }
  const next: LockState = { ...current, failures: current.failures + 1 };
  if (next.failures >= superMaxAttempts) {
    next.lockedUntil = now + superLockMs;
  }
  map.set(key, next);
}

function clearFailures(keyIp: string, keyEmail: string) {
  superLoginByIp.delete(keyIp);
  superLoginByEmail.delete(keyEmail);
}

function getRemainingLockSeconds(map: Map<string, LockState>, key: string) {
  const state = map.get(key);
  if (!state?.lockedUntil) return 0;
  return Math.max(0, Math.ceil((state.lockedUntil - Date.now()) / 1000));
}

function isLocked(map: Map<string, LockState>, key: string) {
  const state = map.get(key);
  if (!state?.lockedUntil) return false;
  if (Date.now() > state.lockedUntil) {
    map.delete(key);
    return false;
  }
  return true;
}

function normalizeTotpToken(value: unknown): string {
  return String(value || "").replace(/\s+/g, "").replace(/-/g, "").trim();
}

async function verifySuperTotpToken(secret: string, token: string): Promise<boolean> {
  const normalized = normalizeTotpToken(token);
  if (!/^\d{6,8}$/.test(normalized)) return false;
  const result: any = await verifyTotp({ token: normalized, secret, strategy: "totp", window: [1, 1] } as any);
  return result === true || result?.isValid === true;
}

async function logSuperSecurity(superAdminId: number | null, action: string, metadata: Record<string, unknown>) {
  await db.insert(superAdminAuditLogs).values({
    superAdminId,
    action,
    metadata,
  });
}

function buildPublicBaseUrl(req: Request) {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
          const payload = verifyToken(token);
          if (payload.tenantId) {
            await storage.createAuditLog({
              tenantId: payload.tenantId,
              userId: payload.userId,
              action: "logout",
              entityType: "auth",
              metadata: {
                ip: req.ip,
                userAgent: req.headers["user-agent"] || null,
              },
            });
          }
        } catch {
          // Stateless JWT best effort.
        }
      }
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: true });
    }
  });

  app.post("/api/auth/logout-all", tenantAuth, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const userId = req.auth!.userId;
      if (!userId || userId <= 0) {
        return res.status(400).json({ error: "Usuario inválido", code: "USER_INVALID" });
      }
      const user = await storage.getUserById(userId, tenantId);
      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
      }
      await storage.updateUser(userId, tenantId, { tokenInvalidBefore: new Date() } as any);
      await storage.createAuditLog({ tenantId, userId, action: "logout_all", entityType: "auth", metadata: { ip: req.ip } });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "No se pudo cerrar todas las sesiones", code: "AUTH_LOGOUT_ALL_ERROR" });
    }
  });

  app.post("/api/auth/super/login", superLoginLimiter, async (req, res) => {
    try {
      const parsed = superLoginSchema.parse(req.body || {});
      const email = parsed.email.trim().toLowerCase();
      const password = parsed.password;
      const totpCode = parsed.totpCode;
      const ip = getClientIp(req);
      if (!isIpAllowedForSuperAdmin(req)) {
        await logSuperSecurity(null, "SUPER_LOGIN_IP_BLOCKED", { ip, email });
        return res.status(403).json({ error: "Acceso restringido", code: "SUPERADMIN_IP_BLOCKED" });
      }

      const ipKey = `ip:${ip}`;
      const emailKey = `email:${email}`;
      if (isLocked(superLoginByIp, ipKey) || isLocked(superLoginByEmail, emailKey)) {
        const retryAfterSec = Math.max(getRemainingLockSeconds(superLoginByIp, ipKey), getRemainingLockSeconds(superLoginByEmail, emailKey));
        await logSuperSecurity(null, "SUPER_LOGIN_LOCKED", { ip, email, retryAfterSec });
        res.setHeader("Retry-After", String(retryAfterSec || 1));
        return res.status(429).json({ error: "Demasiados intentos fallidos. Probá más tarde.", code: "SUPERAUTH_LOCKED", retryAfterSec });
      }

      const user = await storage.getSuperAdminByEmail(email);
      if (!user || user.deletedAt || !user.isActive) {
        markFailure(superLoginByIp, ipKey);
        markFailure(superLoginByEmail, emailKey);
        await logSuperSecurity(null, "SUPER_LOGIN_FAIL", { ip, email, reason: "USER" });
        return res.status(401).json({ error: "Credenciales inválidas", code: "SUPERAUTH_INVALID" });
      }

      const valid = await comparePassword(password, user.password);
      if (!valid) {
        markFailure(superLoginByIp, ipKey);
        markFailure(superLoginByEmail, emailKey);
        await logSuperSecurity(user.id, "SUPER_LOGIN_FAIL", { ip, email, reason: "PASSWORD" });
        return res.status(401).json({ error: "Credenciales inválidas", code: "SUPERAUTH_INVALID" });
      }

      const totpRows = await db.select().from(superAdminTotp).where(eq(superAdminTotp.superAdminId, user.id)).limit(1);
      const totp = totpRows[0];
      if (totp?.enabled) {
        if (!totpCode) {
          return res.status(401).json({ error: "Ingresá el código de verificación de 2 factores", code: "SUPERADMIN_2FA_REQUIRED" });
        }
        if (!totp.secret || !totp.secret.trim()) {
          return res.status(401).json({ error: "2FA inválido: secreto no configurado", code: "SUPERADMIN_2FA_MISCONFIGURED" });
        }
        const ok = await verifySuperTotpToken(totp.secret, totpCode);
        if (!ok) {
          markFailure(superLoginByIp, ipKey);
          markFailure(superLoginByEmail, emailKey);
          await logSuperSecurity(user.id, "SUPER_LOGIN_FAIL", { ip, email, reason: "TOTP" });
          return res.status(401).json({ error: "Código de verificación inválido", code: "SUPERADMIN_2FA_INVALID" });
        }
      }

      clearFailures(ipKey, emailKey);
      await logSuperSecurity(user.id, "SUPER_LOGIN_SUCCESS", { ip, email });

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: "super_admin",
        tenantId: user.tenantId ?? null,
        isSuperAdmin: true,
        branchId: null,
      });
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: "super_admin",
          tenantId: user.tenantId ?? null,
          isSuperAdmin: true,
          branchId: null,
          avatarUrl: user.avatarUrl || null,
        },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "SUPERAUTH_INVALID_INPUT", details: err.errors });
      }
      res.status(500).json({ error: "No se pudo iniciar sesión", code: "SUPERAUTH_ERROR" });
    }
  });

  app.post("/api/auth/login", strictLoginLimiter, tenantLoginLimiter, async (req, res) => {
    try {
      const { tenantCode, email, userId, password } = tenantLoginSchema.parse(req.body);
      const fingerprint = buildLoginFingerprint({ tenantCode, email, userId, ip: getClientIp(req) });
      const lockState = await getLoginAttemptState(fingerprint);
      const lockHint = loginHintFromState(lockState);
      if (lockHint.lockedSeconds > 0) {
        res.setHeader("Retry-After", String(lockHint.lockedSeconds));
        return res.status(429).json({
          error: "Demasiados intentos fallidos. Esperá 1 minuto antes de volver a intentar.",
          code: "AUTH_TEMP_LOCKED",
          showForgotPassword: true,
          failedAttempts: lockHint.failedCount,
          lockedSeconds: lockHint.lockedSeconds,
        });
      }

      const tenant = await storage.getTenantByCode(tenantCode);
      if (!tenant) {
        return res.status(401).json({ error: "Credenciales incorrectas", code: "AUTH_INVALID" });
      }
      if (tenant.deletedAt) return res.status(403).json({ error: "Negocio eliminado", code: "TENANT_DELETED" });
      if (tenant.isBlocked) return res.status(403).json({ error: "Negocio bloqueado", code: "TENANT_BLOCKED" });
      if (!tenant.isActive) return res.status(403).json({ error: "Cuenta bloqueada por falta de pago. Contacte al administrador.", code: "ACCOUNT_BLOCKED" });

      const user = userId
        ? await storage.getUserById(userId, tenant.id)
        : await storage.getUserByEmail(email, tenant.id);
      const userMatches = user && user.email.toLowerCase() === email.toLowerCase();

      if (!user || !user.isActive || !userMatches) {
        const next = await registerFailedLoginAttempt({ fingerprint, tenantId: tenant.id, tenantCode, userId: userId || null, email, ip: getClientIp(req) });
        return res.status(401).json({
          error: "Credenciales incorrectas",
          code: "AUTH_INVALID",
          failedAttempts: next.failedCount,
          showForgotPassword: next.showForgotPassword,
          lockedSeconds: next.lockedSeconds,
        });
      }

      const valid = await comparePassword(password, user.password);
      if (!valid) {
        const next = await registerFailedLoginAttempt({ fingerprint, tenantId: tenant.id, tenantCode, userId: user.id, email, ip: getClientIp(req) });
        return res.status(401).json({
          error: "Credenciales incorrectas",
          code: "AUTH_INVALID",
          failedAttempts: next.failedCount,
          showForgotPassword: next.showForgotPassword,
          lockedSeconds: next.lockedSeconds,
        });
      }

      await clearLoginAttempts(fingerprint);

      let subscriptionWarning: string | null = null;
      if (tenant.subscriptionEndDate) {
        const now = new Date();
        const endDate = new Date(tenant.subscriptionEndDate);
        if (now > endDate) {
          const graceDays = 3;
          const graceEnd = new Date(endDate);
          graceEnd.setDate(graceEnd.getDate() + graceDays);
          const msLeft = graceEnd.getTime() - now.getTime();
          const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
          const daysLeft = Math.floor(hoursLeft / 24);
          subscriptionWarning = daysLeft > 0
            ? `Tu suscripción venció. Tenés ${daysLeft} día(s) y ${hoursLeft % 24}h para renovar antes de que se bloquee tu cuenta.`
            : `Tu suscripción venció. Tenés ${hoursLeft}h para renovar antes de que se bloquee tu cuenta.`;
        } else {
          const msLeft = endDate.getTime() - now.getTime();
          const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
          if (daysLeft <= 7) {
            subscriptionWarning = `Tu suscripción vence en ${daysLeft} día(s). Renová a tiempo para no perder acceso.`;
          }
        }
      }

      const weakEvaluation = evaluatePassword(password, { tenantCode: tenant.code, tenantName: tenant.name, email: user.email });
      setPasswordWeakFlag(user.id, weakEvaluation.score < 45);
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: tenant.id,
        isSuperAdmin: false,
        branchId: user.branchId,
        scope: user.scope || "TENANT",
      });
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          tenantId: tenant.id,
          isSuperAdmin: false,
          branchId: user.branchId,
          scope: user.scope || "TENANT",
          avatarUrl: user.avatarUrl || null,
          passwordWeak: weakEvaluation.score < 45,
        },
        subscriptionWarning,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "AUTH_INVALID_INPUT", details: err.errors });
      }
      res.status(500).json({ error: "No se pudo iniciar sesión", code: "AUTH_ERROR" });
    }
  });

  app.post("/api/auth/password-recovery/request", async (req, res) => {
    try {
      const payload = passwordRecoveryRequestSchema.parse(req.body || {});
      const tenant = await storage.getTenantByCode(payload.tenantCode);
      const genericOk = { ok: true, message: "Si los datos son correctos, enviaremos instrucciones al correo." };
      if (!tenant || tenant.deletedAt || !tenant.isActive || tenant.isBlocked) return res.json(genericOk);

      const user = await storage.getUserById(payload.userId, tenant.id);
      if (!user || user.deletedAt || !user.isActive) return res.json(genericOk);
      if (user.email.toLowerCase() !== payload.email.toLowerCase()) return res.json(genericOk);

      const reset = await createPasswordResetToken({ userId: user.id, tenantId: tenant.id, email: user.email, requestedIp: getClientIp(req) });
      const branding = await storage.getAppBranding().catch(() => null as any);
      const baseUrl = buildPublicBaseUrl(req);
      const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(reset.token)}`;
      const ttlMin = Math.max(5, parseInt(process.env.PASSWORD_RESET_TTL_MIN || "20", 10));
      const template = renderPasswordResetTemplate({
        appName: branding?.orbiaName || "Orbia",
        logoUrl: branding?.orbiaLogoUrl || null,
        resetUrl,
        expiresInMinutes: ttlMin,
      });

      await sendMail({
        to: user.email,
        subject: "Restablecer contraseña · Orbia",
        html: template.html,
        text: template.text,
      });

      return res.json(genericOk);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "PASSWORD_RECOVERY_INVALID_INPUT", details: err.errors });
      }
      return res.json({ ok: true, message: "Si los datos son correctos, enviaremos instrucciones al correo." });
    }
  });

  app.get("/api/auth/password-recovery/validate", async (req, res) => {
    try {
      const token = String(req.query.token || "").trim();
      if (!token) return res.status(400).json({ error: "Token inválido", code: "PASSWORD_RESET_INVALID" });
      const valid = await validatePasswordResetToken(token);
      if (!valid) return res.status(400).json({ error: "Token inválido o expirado", code: "PASSWORD_RESET_INVALID" });
      return res.json({ data: { email: valid.email, expiresAt: valid.expiresAt } });
    } catch {
      return res.status(500).json({ error: "No se pudo validar token", code: "PASSWORD_RESET_VALIDATE_ERROR" });
    }
  });

  app.post("/api/auth/password-recovery/reset", async (req, res) => {
    try {
      const payload = passwordRecoveryResetSchema.parse(req.body || {});
      const token = await consumePasswordResetToken(payload.token);
      if (!token) {
        return res.status(400).json({ error: "Token inválido o expirado", code: "PASSWORD_RESET_INVALID" });
      }

      const user = token.tenantId
        ? await storage.getUserById(token.userId, token.tenantId)
        : await storage.getUserByEmail(token.email, null);
      if (!user) {
        return res.status(400).json({ error: "No se pudo restablecer la contraseña", code: "PASSWORD_RESET_USER_INVALID" });
      }

      const hashed = await hashPassword(payload.newPassword);
      await storage.updateUser(user.id, user.tenantId!, { password: hashed, tokenInvalidBefore: new Date() } as any);
      return res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "PASSWORD_RESET_INVALID_INPUT", details: err.errors });
      }
      return res.status(500).json({ error: "No se pudo restablecer la contraseña", code: "PASSWORD_RESET_ERROR" });
    }
  });
}
