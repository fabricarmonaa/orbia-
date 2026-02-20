import type { Express, Request } from "express";
import { storage } from "../storage";
import { z } from "zod";
import {
  generateToken,
  comparePassword,
  verifyToken,
  isIpAllowedForSuperAdmin,
  getClientIp,
} from "../auth";
import { createRateLimiter } from "../middleware/rate-limit";
import { db } from "../db";
import { superAdminAuditLogs, superAdminTotp } from "@shared/schema";
import { eq } from "drizzle-orm";
import { verify as verifyTotp } from "otplib";
import { sanitizeShortText } from "../security/sanitize";
import { evaluatePassword } from "../services/password-policy";
import { setPasswordWeakFlag } from "../services/password-weak-cache";

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
  password: z.string().min(1).max(256),
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

async function logSuperSecurity(superAdminId: number | null, action: string, metadata: Record<string, unknown>) {
  await db.insert(superAdminAuditLogs).values({
    superAdminId,
    action,
    metadata,
  });
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

  app.post("/api/auth/super/login", superLoginLimiter, async (req, res) => {
    try {
      if (!isIpAllowedForSuperAdmin(req)) {
        return res.status(403).json({ error: "Acceso restringido", code: "SUPERADMIN_IP_BLOCKED" });
      }

      const { email, password, totpCode } = superLoginSchema.parse(req.body);
      const ip = getClientIp(req);
      const ipKey = `ip:${ip}`;
      const emailKey = `email:${email.toLowerCase()}`;

      if (isLocked(superLoginByIp, ipKey) || isLocked(superLoginByEmail, emailKey)) {
        const remaining = Math.max(getRemainingLockSeconds(superLoginByIp, ipKey), getRemainingLockSeconds(superLoginByEmail, emailKey));
        await logSuperSecurity(null, "SUPER_LOGIN_LOCKED", { ip, email, remainingSeconds: remaining });
        return res.status(429).json({
          error: "Acceso temporalmente bloqueado por intentos fallidos.",
          code: "SUPERADMIN_LOCKED",
          secondsRemaining: remaining,
        });
      }

      const user = await storage.getSuperAdminByEmail(email);
      if (user) {
        const rootCode = (process.env.ROOT_TENANT_CODE || "t_root").toLowerCase();
        if (!user.tenantId) {
          await logSuperSecurity(user.id, "SUPER_LOGIN_FAIL", { ip, email, reason: "ROOT_TENANT_REQUIRED" });
          return res.status(403).json({ error: "Superadmin inválido: requiere tenant root", code: "SUPERADMIN_ROOT_REQUIRED" });
        }
        const rootTenant = await storage.getTenantById(user.tenantId);
        if (!rootTenant || String(rootTenant.code || "").toLowerCase() !== rootCode) {
          await logSuperSecurity(user.id, "SUPER_LOGIN_FAIL", { ip, email, reason: "ROOT_TENANT_MISMATCH" });
          return res.status(403).json({ error: "Superadmin no pertenece al tenant root", code: "SUPERADMIN_ROOT_REQUIRED" });
        }
      }
      if (!user) {
        markFailure(superLoginByIp, ipKey);
        markFailure(superLoginByEmail, emailKey);
        await logSuperSecurity(null, "SUPER_LOGIN_FAIL", { ip, email, reason: "NOT_FOUND" });
        return res.status(401).json({ error: "Credenciales incorrectas", code: "SUPERAUTH_INVALID" });
      }

      const valid = await comparePassword(password, user.password);
      if (!valid) {
        markFailure(superLoginByIp, ipKey);
        markFailure(superLoginByEmail, emailKey);
        await logSuperSecurity(user.id, "SUPER_LOGIN_FAIL", { ip, email, reason: "PASSWORD" });
        return res.status(401).json({ error: "Credenciales incorrectas", code: "SUPERAUTH_INVALID" });
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
        const normalizedToken = String(totpCode || "").trim();
        if (!/^\d{6,8}$/.test(normalizedToken)) {
          return res.status(401).json({ error: "Código de verificación inválido", code: "SUPERADMIN_2FA_INVALID" });
        }
        const ok = await verifyTotp({ token: normalizedToken, secret: totp.secret, strategy: "totp", window: 1 } as any);
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
        tenantId: null,
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
          tenantId: null,
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

  app.post("/api/auth/login", tenantLoginLimiter, async (req, res) => {
    try {
      const { tenantCode, email, password } = tenantLoginSchema.parse(req.body);
      const tenant = await storage.getTenantByCode(tenantCode);
      if (!tenant) {
        return res.status(401).json({ error: "Negocio no encontrado", code: "TENANT_NOT_FOUND" });
      }
      if (tenant.deletedAt) {
        return res.status(403).json({ error: "Negocio eliminado", code: "TENANT_DELETED" });
      }
      if (tenant.isBlocked) {
        return res.status(403).json({ error: "Negocio bloqueado", code: "TENANT_BLOCKED" });
      }
      if (!tenant.isActive) {
        return res.status(403).json({ error: "Cuenta bloqueada por falta de pago. Contacte al administrador.", code: "ACCOUNT_BLOCKED" });
      }
      if (tenant.subscriptionEndDate) {
        const now = new Date();
        const endDate = new Date(tenant.subscriptionEndDate);
        const graceDays = 3;
        const graceEnd = new Date(endDate);
        graceEnd.setDate(graceEnd.getDate() + graceDays);
        if (now > graceEnd) {
          await storage.updateTenantActive(tenant.id, false);
          return res.status(403).json({ error: "Cuenta bloqueada por falta de pago. Contacte al administrador.", code: "ACCOUNT_BLOCKED" });
        }
      }
      const user = await storage.getUserByEmail(email, tenant.id);
      if (!user || !user.isActive) {
        return res.status(401).json({ error: "Credenciales incorrectas", code: "AUTH_INVALID" });
      }
      const valid = await comparePassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Credenciales incorrectas", code: "AUTH_INVALID" });
      }
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
}
