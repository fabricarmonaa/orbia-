import type { Express, Request } from "express";
import { storage } from "../storage";
import { z } from "zod";
import {
  generateToken,
  comparePassword,
  hashPassword,
  verifyToken,
  isIpAllowedForSuperAdmin,
  getClientIp,
  tenantAuth,
} from "../auth";
import { createRateLimiter } from "../middleware/rate-limit";
import { strictLoginLimiter } from "../middleware/http-rate-limit";
import { db } from "../db";
import { passwordResetTokens, superAdminAuditLogs, superAdminTotp, users } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { verify as verifyTotp } from "otplib";
import { sanitizeShortText } from "../security/sanitize";
import { evaluatePassword } from "../services/password-policy";
import { setPasswordWeakFlag } from "../services/password-weak-cache";
import { isMailerConfigured, sendMail } from "../services/mailer/gmailMailer";
import { buildPasswordResetUrl, consumePasswordResetToken, issuePasswordResetToken, validatePasswordResetToken } from "../services/password-recovery";
import { randomUUID } from "crypto";
import { userGoogleConnections } from "@shared/schema";
import { buildGoogleAuthUrl, decodeState, exchangeGoogleCode, fetchGoogleProfile, encryptGoogleToken, getAllowedParentOrigins, getRedirectUri, validateParentOrigin } from "../services/google-oauth";
import { createPublicTrialSignup } from "../services/public-signup";
import {
  clearRefreshCookie,
  createRefreshSession,
  getAccessTokenTtlSeconds,
  getRefreshCookieName,
  getRefreshSessionByToken,
  isRefreshSessionUsable,
  readCookie,
  revokeRefreshSession,
  revokeRefreshSessionsForUser,
  serializeRefreshCookie,
  touchRefreshSession,
} from "../services/auth-refresh-sessions";

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
  email: z.string().trim().email().max(120),
  password: z.string().min(1).max(256),
  rememberDevice: z.boolean().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(120),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(300),
  newPassword: z.string().min(6).max(120),
});


const googleStartSchema = z.object({
  intent: z.enum(["login", "calendar"]).default("login"),
  parentOrigin: z.string().trim().url().optional(),
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
  keyGenerator: (req) => `tenant-login:${req.ip}:${String(req.body?.email || "").toLowerCase()}`,
  errorMessage: "Demasiados intentos. Intentá nuevamente en unos minutos.",
  code: "RATE_LIMITED",
  onLimit: async ({ req, retryAfterSec }) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return;
    const user = await storage.getUserByEmail(email).catch(() => undefined);
    if (!user || !user.tenantId) return;
    await storage.createAuditLog({
      tenantId: user.tenantId,
      userId: null,
      action: "brute_force_blocked",
      entityType: "auth",
      metadata: { route: "/api/auth/login", ip: req.ip, retryAfterSec },
    }).catch(() => undefined);
  },
});

const forgotPasswordLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.AUTH_FORGOT_LIMIT || "5", 10),
  keyGenerator: (req) => `auth-forgot:${req.ip}:${String(req.body?.email || "").toLowerCase()}`,
  errorMessage: "Demasiados intentos. Intentá nuevamente en unos minutos.",
  code: "RATE_LIMITED",
});

const resetPasswordLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.AUTH_RESET_LIMIT || "10", 10),
  keyGenerator: (req) => `auth-reset:${req.ip}`,
  errorMessage: "Demasiados intentos. Intentá nuevamente en unos minutos.",
  code: "RATE_LIMITED",
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


export function registerAuthRoutes(app: Express) {
  function buildTenantAuthPayload(user: any) {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      isSuperAdmin: false,
      branchId: user.branchId,
      scope: user.scope || "TENANT",
    };
  }

  async function issueTenantSession(req: Request, res: any, user: any, rememberDevice: boolean) {
    const refresh = await createRefreshSession({
      tenantId: user.tenantId,
      userId: user.id,
      rememberDevice,
      deviceLabel: rememberDevice ? "remember-device" : "session-device",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || null,
    });
    res.setHeader("Set-Cookie", serializeRefreshCookie(refresh.token, refresh.expiresAt));
    return generateToken(buildTenantAuthPayload(user), {
      expiresIn: `${getAccessTokenTtlSeconds()}s`,
    });
  }

  app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body || {});
      const normalizedEmail = email.trim().toLowerCase();
      const ip = getClientIp(req);
      const genericResponse = {
        ok: true,
        message: "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.",
      };

      if (!isMailerConfigured()) {
        console.error("[auth:forgot-password] mailer no configurado", {
          requestId: req.requestId,
          hasClientId: !!process.env.GMAIL_OAUTH_CLIENT_ID,
          hasClientSecret: !!process.env.GMAIL_OAUTH_CLIENT_SECRET,
          hasRefreshToken: !!process.env.GMAIL_OAUTH_REFRESH_TOKEN,
          hasFrom: !!process.env.GMAIL_FROM,
        });
        return res.status(503).json({ error: "El servicio de correo no está disponible", code: "MAILER_NOT_CONFIGURED" });
      }

      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user || !user.isActive || user.disabled || !user.tenantId) {
        console.warn("[auth:forgot-password] solicitud omitida por usuario inexistente/inactivo", {
          requestId: req.requestId,
          email: normalizedEmail,
          userFound: !!user,
          userActive: !!user?.isActive,
        });
        return res.json(genericResponse);
      }

      const tenant = await storage.getTenantById(user.tenantId);
      if (!tenant || tenant.deletedAt || tenant.isBlocked || !tenant.isActive) {
        console.warn("[auth:forgot-password] solicitud omitida por tenant inválido/inactivo", {
          requestId: req.requestId,
          tenantId: user.tenantId,
          email: normalizedEmail,
          tenantFound: !!tenant,
          tenantDeleted: !!tenant?.deletedAt,
          tenantBlocked: !!tenant?.isBlocked,
          tenantActive: !!tenant?.isActive,
        });
        return res.json(genericResponse);
      }

      console.log("[auth:forgot-password] emitiendo token y enviando mail", {
        requestId: req.requestId,
        tenantId: tenant.id,
        userId: user.id,
        email: normalizedEmail,
        ip,
      });

      const { rawToken, expiresAt } = await issuePasswordResetToken({
        tenantId: tenant.id,
        userId: user.id,
        email: user.email,
        ip,
        userAgent: req.headers["user-agent"] || null,
      });

      const resetUrl = buildPasswordResetUrl(rawToken);
      const ttlMinutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
      await sendMail({
        to: user.email,
        subject: `Restablecer contraseña - ${tenant.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:620px;margin:0 auto;padding:16px">
            <h2 style="margin:0 0 12px">Restablecer contraseña</h2>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <b>Orbia</b>.</p>
            <p>Si fuiste vos, hacé clic en el siguiente botón:</p>
            <p style="margin:22px 0">
              <a href="${resetUrl}" style="background:#111827;color:#fff;padding:12px 16px;border-radius:8px;text-decoration:none;display:inline-block">Restablecer contraseña</a>
            </p>
            <p>Este enlace vence en <b>${ttlMinutes} minutos</b> y puede usarse una sola vez.</p>
            <p>Si no solicitaste este cambio, podés ignorar este correo.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0"/>
            <p style="font-size:12px;color:#6b7280">Enlace directo: ${resetUrl}</p>
            <p style="font-size:12px;color:#6b7280">Generado por Orbia</p>
          </div>
        `,
        text: `Recibimos una solicitud para restablecer tu contraseña en Orbia. Si fuiste vos, abrí este enlace: ${resetUrl}. Vence en ${ttlMinutes} minutos y se puede usar una sola vez. Si no fuiste vos, ignorá este mensaje.`,
      });

      console.log("[auth:forgot-password] correo enviado", {
        requestId: req.requestId,
        tenantId: tenant.id,
        userId: user.id,
        email: normalizedEmail,
        expiresAt: expiresAt.toISOString(),
      });

      await storage.createAuditLog({
        tenantId: tenant.id,
        userId: user.id,
        action: "forgot_password_email_sent",
        entityType: "auth",
        metadata: { email: normalizedEmail, expiresAt: expiresAt.toISOString() },
      }).catch(() => undefined);

      return res.json({ ...genericResponse, mailSent: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "AUTH_FORGOT_INVALID", details: err.errors });
      }
      console.error("[auth:forgot-password] error enviando recuperación", {
        requestId: req.requestId,
        code: err?.code || null,
        message: err?.message || "AUTH_FORGOT_ERROR",
      });
      return res.status(502).json({ error: "No se pudo enviar el correo de recuperación", code: err?.code || "AUTH_FORGOT_ERROR" });
    }
  });

  app.get("/api/auth/reset-password/validate", async (req, res) => {
    try {
      const token = z.string().trim().min(20).max(300).parse(req.query.token);
      const validRow = await validatePasswordResetToken(token);
      if (!validRow) {
        return res.status(400).json({ valid: false, error: "El enlace es inválido o venció", code: "RESET_TOKEN_INVALID" });
      }
      return res.json({ valid: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ valid: false, error: "Token inválido", code: "RESET_TOKEN_INVALID" });
      }
      return res.status(500).json({ valid: false, error: "No se pudo validar el enlace", code: "RESET_TOKEN_VALIDATE_ERROR" });
    }
  });

  app.post("/api/auth/reset-password", resetPasswordLimiter, async (req, res) => {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(req.body || {});
      const tokenRow = await validatePasswordResetToken(token);
      if (!tokenRow) {
        return res.status(400).json({ error: "El enlace es inválido o venció", code: "RESET_TOKEN_INVALID" });
      }

      const tenant = await storage.getTenantById(tokenRow.tenantId!);
      const evaluation = evaluatePassword(newPassword, {
        tenantCode: tenant?.code || null,
        tenantName: tenant?.name || null,
        email: tokenRow.email,
      });
      if (!evaluation.isValid) {
        return res.status(400).json({
          error: "La nueva contraseña no cumple los requisitos mínimos",
          code: "RESET_PASSWORD_WEAK",
          warnings: evaluation.warnings,
          requirements: evaluation.requirements,
        });
      }

      const consumed = await consumePasswordResetToken(tokenRow.tokenId);
      if (!consumed) {
        return res.status(400).json({ error: "El enlace ya fue utilizado o venció", code: "RESET_TOKEN_ALREADY_USED" });
      }

      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(tokenRow.userId, tokenRow.tenantId!, {
        password: hashedPassword,
        tokenInvalidBefore: new Date() as any,
      });

      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, tokenRow.userId), isNull(passwordResetTokens.usedAt)));

      return res.json({ ok: true, message: "Contraseña actualizada correctamente" });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "AUTH_RESET_INVALID", details: err.errors });
      }
      return res.status(500).json({ error: "No se pudo restablecer la contraseña", code: "AUTH_RESET_ERROR" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const refreshToken = readCookie(req.headers.cookie, getRefreshCookieName());
      if (refreshToken) {
        const session = await getRefreshSessionByToken(refreshToken);
        if (session) {
          await revokeRefreshSession(session.id);
        }
      }
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
      res.setHeader("Set-Cookie", clearRefreshCookie());
      return res.json({ ok: true });
    } catch {
      res.setHeader("Set-Cookie", clearRefreshCookie());
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
      await storage.updateUser(userId, tenantId, { tokenInvalidBefore: new Date() as any });
      await revokeRefreshSessionsForUser(tenantId, userId);
      await storage.createAuditLog({
        tenantId,
        userId,
        action: "logout_all",
        entityType: "auth",
        metadata: { ip: req.ip, userAgent: req.headers["user-agent"] || null },
      });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "No se pudo cerrar todas las sesiones", code: "LOGOUT_ALL_ERROR" });
    }
  });

  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const refreshToken = readCookie(req.headers.cookie, getRefreshCookieName());
      if (!refreshToken) {
        res.setHeader("Set-Cookie", clearRefreshCookie());
        return res.status(401).json({ error: "Sesión no disponible", code: "AUTH_REFRESH_REQUIRED" });
      }

      const session = await getRefreshSessionByToken(refreshToken);
      if (!session || !isRefreshSessionUsable(session)) {
        if (session) await revokeRefreshSession(session.id);
        res.setHeader("Set-Cookie", clearRefreshCookie());
        return res.status(401).json({ error: "Sesión vencida", code: "AUTH_REFRESH_EXPIRED" });
      }

      const user = await storage.getUserById(session.userId, session.tenantId);
      if (!user || user.disabled || !user.isActive || user.deletedAt) {
        await revokeRefreshSession(session.id);
        res.setHeader("Set-Cookie", clearRefreshCookie());
        return res.status(401).json({ error: "Usuario inválido", code: "AUTH_INVALID" });
      }

      if (user.tokenInvalidBefore && session.createdAt <= new Date(user.tokenInvalidBefore)) {
        await revokeRefreshSession(session.id);
        res.setHeader("Set-Cookie", clearRefreshCookie());
        return res.status(401).json({ error: "Sesión revocada", code: "AUTH_REFRESH_REVOKED" });
      }

      const touchedSession = await touchRefreshSession(session.id);
      const token = generateToken(buildTenantAuthPayload(user), { expiresIn: `${getAccessTokenTtlSeconds()}s` });
      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          tenantId: user.tenantId,
          isSuperAdmin: false,
          branchId: user.branchId,
          scope: user.scope || "TENANT",
          avatarUrl: user.avatarUrl || null,
        },
        session: {
          rememberDevice: touchedSession?.rememberDevice ?? session.rememberDevice,
          expiresAt: touchedSession?.expiresAt ?? session.expiresAt,
        },
      });
    } catch (err) {
      console.error("[auth:refresh]", err);
      // Error transitorio del backend: no invalidamos la cookie para evitar logout agresivo.
      return res.status(500).json({ error: "No se pudo renovar la sesión", code: "AUTH_REFRESH_ERROR" });
    }
  });

  app.get("/api/auth/session", async (req, res) => {
    try {
      const refreshToken = readCookie(req.headers.cookie, getRefreshCookieName());
      if (!refreshToken) return res.status(204).send();

      const session = await getRefreshSessionByToken(refreshToken);
      if (!session || !isRefreshSessionUsable(session)) {
        if (session) await revokeRefreshSession(session.id);
        res.setHeader("Set-Cookie", clearRefreshCookie());
        return res.status(204).send();
      }

      const user = await storage.getUserById(session.userId, session.tenantId);
      if (!user || user.disabled || !user.isActive || user.deletedAt) {
        await revokeRefreshSession(session.id);
        res.setHeader("Set-Cookie", clearRefreshCookie());
        return res.status(204).send();
      }

      const touchedSession = await touchRefreshSession(session.id);
      const token = generateToken(buildTenantAuthPayload(user), { expiresIn: `${getAccessTokenTtlSeconds()}s` });
      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          tenantId: user.tenantId,
          isSuperAdmin: false,
          branchId: user.branchId,
          scope: user.scope || "TENANT",
          avatarUrl: user.avatarUrl || null,
        },
        session: {
          rememberDevice: touchedSession?.rememberDevice ?? session.rememberDevice,
          expiresAt: touchedSession?.expiresAt ?? session.expiresAt,
        },
      });
    } catch (err) {
      console.error("[auth:session]", err);
      return res.status(500).json({ error: "No se pudo rehidratar la sesión", code: "AUTH_SESSION_ERROR" });
    }
  });

  app.post("/api/auth/super/login", superLoginLimiter, async (req, res) => {
    try {
      if (!isIpAllowedForSuperAdmin(req)) {
        return res.status(403).json({ error: "Acceso restringido", code: "SUPERADMIN_IP_BLOCKED" });
      }

      const parsed = superLoginSchema.parse(req.body);
      const email = parsed.email.trim().toLowerCase();
      const password = parsed.password;
      const totpCode = parsed.totpCode;
      const ip = getClientIp(req);
      const ipKey = `ip:${ip}`;
      const emailKey = `email:${email}`;

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
      if (user?.tenantId) {
        const rootCode = (process.env.ROOT_TENANT_CODE || "t_root").toLowerCase();
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



  app.get("/api/auth/google/start", async (req, res) => {
    try {
      const { intent, parentOrigin: parentOriginFromQuery } = googleStartSchema.parse(req.query || {});
      let refererOrigin: string | undefined;
      if (req.headers.referer) {
        try {
          refererOrigin = new URL(req.headers.referer).origin;
        } catch {
          refererOrigin = undefined;
        }
      }
      const headerOrigin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;

      const candidateOrigins = [parentOriginFromQuery, headerOrigin, refererOrigin].filter(Boolean) as string[];
      const parentOrigin = candidateOrigins.map((origin) => validateParentOrigin(origin)).find(Boolean);
      if (!parentOrigin) {
        return res.status(400).json({
          error: "Origen no autorizado para Google Sign-In.",
          code: "GOOGLE_ORIGIN_NOT_ALLOWED",
        });
      }

      const redirectUri = getRedirectUri(intent);
      console.log("[google:start]", {
        requestId: req.requestId,
        intent,
        nodeEnv: process.env.NODE_ENV || null,
        appOrigin: process.env.APP_ORIGIN || null,
        publicAppUrl: process.env.PUBLIC_APP_URL || null,
        backendUrl: process.env.BACKEND_URL || null,
        googleAuthRedirectEnv: process.env.GOOGLE_OAUTH_REDIRECT_URI || null,
        googleCalendarRedirectEnv: process.env.GOOGLE_CALENDAR_REDIRECT_URI || null,
        parentOriginFromQuery: parentOriginFromQuery || null,
        headerOrigin: headerOrigin || null,
        refererOrigin: refererOrigin || null,
        parentOriginResolved: parentOrigin,
        redirectUri,
      });

      const authUrl = buildGoogleAuthUrl({
        intent,
        nonce: randomUUID(),
        parentOrigin,
      });
      return res.json({ url: authUrl });
    } catch (err: any) {
      return res.status(400).json({ error: "No pudimos iniciar Google Sign-In." });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const GOOGLE_AUTH_EVENT_TYPE = "orbia-google-auth";

    const emitToParent = (payload: Record<string, unknown>, parentOrigin: string) => {
      const safe = JSON.stringify(payload).replace(/</g, "\u003c");
      // Usamos el parentOrigin validado (guardado en state durante /start) como targetOrigin.
      // Esto garantiza que el mensaje solo llegue al origin correcto (app o landing).
      const targetOrigin = JSON.stringify(parentOrigin);

      // Deshabilitamos aislamiento cross-origin estricto para mantener window.opener en popup OAuth.
      res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
      res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
      // Permitimos la ejecución del script inline sobrescribiendo el CSP global.
      res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'");

      console.log("[google:callback:postmessage]", { requestId: (req as any).requestId, targetOrigin: parentOrigin });

      const html = `<!doctype html><html><body><script>
        (function(){
          const data = ${safe};
          const target = ${targetOrigin};
          const eventType = ${JSON.stringify(GOOGLE_AUTH_EVENT_TYPE)};
          if (window.opener) {
            window.opener.postMessage({ type: eventType, ...data }, target);
            window.close();
          } else {
            document.body.innerText = data.message || 'Podés cerrar esta ventana.';
          }
        })();
      </script></body></html>`;

      return res.status(200).send(html);
    };

    // fallbackOrigin mientras no tengamos el state decodificado
    const fallbackOrigin = (() => {
      const explicit = validateParentOrigin(process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || process.env.BACKEND_URL);
      if (explicit) return explicit;
      const allowed = getAllowedParentOrigins();
      if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
        const nonLocalhost = allowed.find((origin) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));
        if (nonLocalhost) return nonLocalhost;
        return "https://app.orbiapanel.com";
      }
      return "http://localhost:5000";
    })();
    const emit = (payload: Record<string, unknown>, parentOrigin?: string) =>
      emitToParent(payload, parentOrigin || fallbackOrigin);

    let parentOrigin = fallbackOrigin;

    try {
      const code = String(req.query.code || "");
      const state = decodeState(String(req.query.state || ""));
      
      if (state && state.parentOrigin) {
        parentOrigin = validateParentOrigin(state.parentOrigin) || fallbackOrigin;
      }

      if (!code || !state) {
        console.warn("[google:callback] invalid state/code", { requestId: req.requestId, hasCode: !!code, hasState: !!state, parentOrigin });
        return emit({ ok: false, message: "La autorización de Google no fue válida." }, parentOrigin);
      }

      console.log("[google:callback]", { requestId: req.requestId, nodeEnv: process.env.NODE_ENV || null, parentOrigin, redirectUri: getRedirectUri("login") });
      const tokenData = await exchangeGoogleCode(code, "login");
      const profile = await fetchGoogleProfile(tokenData.accessToken);

      if (state.intent === "login") {
        let user = await storage.getUserByEmail(profile.email);
        let currentTenantId: number;
        
        if (!user) {
          const ownerName = profile.email.split('@')[0];
          const password = randomUUID();
          const created = await createPublicTrialSignup({
            tenantName: "Mi Negocio",
            adminName: profile.name || ownerName,
            email: profile.email,
            password,
            industry: "General",
          });
          
          user = await storage.getUserByEmail(profile.email);
          if (!user || !user.tenantId) {
             return emit({ ok: false, message: "No se pudo crear la cuenta de usuario." }, parentOrigin);
          }
          currentTenantId = user.tenantId;
          
          if (profile.picture) {
             await storage.updateUser(user.id, currentTenantId, { avatarUrl: profile.picture });
             user.avatarUrl = profile.picture;
          }
        } else {
          if (user.disabled || !user.isActive) {
            return emit({ ok: false, message: "Tu usuario está deshabilitado. Contactá al administrador." }, parentOrigin);
          }
          currentTenantId = user.tenantId!;
          const tenant = await storage.getTenantById(currentTenantId);
          if (!tenant || tenant.deletedAt || !tenant.isActive || tenant.isBlocked) {
            return emit({ ok: false, message: "El negocio ya no está disponible o está inactivo." }, parentOrigin);
          }
        }
        const now = new Date();
        const expires = tokenData.expiresIn > 0 ? new Date(now.getTime() + tokenData.expiresIn * 1000) : null;
        const existing = await db.select().from(userGoogleConnections).where(eq(userGoogleConnections.userId, user.id)).limit(1);
        const values = {
          tenantId: currentTenantId,
          userId: user.id,
          googleUserId: profile.sub,
          googleEmail: profile.email,
          encryptedRefreshToken: encryptGoogleToken(tokenData.refreshToken),
          encryptedAccessToken: encryptGoogleToken(tokenData.accessToken),
          accessTokenExpiresAt: expires,
          scopes: tokenData.scope,
          updatedAt: now,
          isActive: true,
        };
        if (existing[0]) {
          await db.update(userGoogleConnections).set(values).where(eq(userGoogleConnections.id, existing[0].id));
        } else {
          await db.insert(userGoogleConnections).values(values as any);
        }

        const jwt = generateToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          tenantId: currentTenantId,
          isSuperAdmin: false,
          branchId: user.branchId,
          scope: user.scope || "TENANT",
        });
        return emit({ ok: true, mode: "login", token: jwt, user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          tenantId: currentTenantId,
          isSuperAdmin: false,
          branchId: user.branchId,
          scope: user.scope || "TENANT",
          avatarUrl: user.avatarUrl || null,
        }, message: "Cuenta de Google conectada correctamente." }, parentOrigin);
      }

      return emit({ ok: false, message: "Flujo no soportado en este endpoint." }, parentOrigin);
    } catch (err: any) {
      console.error("[Google OAuth Callback Error]", err);
      return emit({ ok: false, message: err?.message || "No pudimos completar el acceso con Google.", details: err?.toString() }, parentOrigin);
    }
  });

  app.post("/api/auth/login", strictLoginLimiter, tenantLoginLimiter, async (req, res) => {
    try {
      const { email, password, rememberDevice } = tenantLoginSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(email);
      if (!user || !user.isActive || user.disabled || !user.tenantId) {
        return res.status(401).json({ error: "Credenciales incorrectas", code: "AUTH_INVALID" });
      }

      const tenant = await storage.getTenantById(user.tenantId);
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
      const token = await issueTenantSession(req, res, { ...user, tenantId: tenant.id }, rememberDevice === true);
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
        session: {
          rememberDevice: rememberDevice === true,
          accessTokenExpiresInSec: getAccessTokenTtlSeconds(),
        },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "AUTH_INVALID_INPUT", details: err.errors });
      }
      res.status(500).json({ error: "No se pudo iniciar sesión", code: "AUTH_ERROR" });
    }
  });
}
