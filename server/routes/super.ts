import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { superAuth, hashPassword, comparePassword } from "../auth";
import { profileUpload } from "./uploads";
import { handleSingleUpload } from "../middleware/upload-guards";
import { createRateLimiter } from "../middleware/rate-limit";
import crypto from "crypto";
import { db } from "../db";
import { superAdminTotp, superAdminAuditLogs, users, emailCampaigns, emailDeliveryLogs } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import QRCode from "qrcode";
import { sendMail, isMailerConfigured } from "../services/mailer/gmailMailer";

const createTenantSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(80),
  planId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.coerce.number().int().positive().nullable()
  ).optional(),
  adminEmail: z.string().trim().email().max(120),
  adminPassword: z.string().min(6).max(128),
  adminName: z.string().trim().min(2).max(80),
});

const planUpdateSchema = z.object({
  planId: z.coerce.number().int().positive(),
});

const blockSchema = z.object({
  blocked: z.boolean(),
});

const renameSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

const setPasswordSchema = z.object({
  newPassword: z.string().min(6).max(128),
});

const deleteSchema = z.object({
  confirmText: z.string().trim().min(2).max(200),
});

const updateSuperCredentialsSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  newEmail: z.string().trim().email().max(120).optional(),
  newPassword: z.string().min(10).max(128).regex(/[A-Z]/, "Debe incluir una mayúscula").regex(/[0-9]/, "Debe incluir un número").optional(),
});

const setup2faSchema = z.object({
  accountLabel: z.string().trim().max(120).optional(),
});

const verify2faSchema = z.object({
  token: z.string().trim().min(6).max(8),
});

const disable2faSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  token: z.string().trim().min(6).max(8),
});


const sendEmailSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  html: z.string().trim().min(1).max(20000),
  text: z.string().trim().max(10000).optional(),
  sendToAll: z.boolean().default(false),
  tenantIds: z.array(z.coerce.number().int().positive()).optional().default([]),
});

const blockTenantBodySchema = z.object({
  blocked: z.boolean(),
});



async function buildTenantSummary(tenant: any) {
  const [plan, owner, addons] = await Promise.all([
    tenant.planId ? storage.getPlanById(tenant.planId) : Promise.resolve(undefined),
    storage.getPrimaryTenantAdmin(tenant.id),
    storage.getTenantAddons(tenant.id),
  ]);

  return {
    ...tenant,
    planName: plan?.name || null,
    ownerName: owner?.fullName || null,
    ownerEmail: owner?.email || null,
    email: owner?.email || null,
    addonsActive: (addons || []).filter((a: any) => a.enabled).map((a: any) => a.addonKey),
    status: tenant.deletedAt ? "deleted" : tenant.isBlocked ? "blocked" : tenant.isActive ? "active" : "blocked",
  };
}

function generateStrongTempPassword() {
  const part = crypto.randomBytes(16).toString("base64").replace(/[^a-zA-Z0-9]/g, "");
  return `${part.slice(0, 10)}A9!`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerSuperRoutes(app: Express) {
  const avatarUploadLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: parseInt(process.env.UPLOADS_LIMIT_PER_MIN || "6", 10),
    keyGenerator: (req) => `avatar:${req.auth?.userId || req.ip}`,
    errorMessage: "Demasiadas subidas. Intentá en un minuto.",
    code: "UPLOAD_RATE_LIMIT",
  });
  app.get("/api/super/plans", superAuth, async (_req, res) => {
    try {
      const data = await storage.getPlans();
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/super/tenants", superAuth, async (_req, res) => {
    try {
      const data = await storage.getTenants();
      const enriched = await Promise.all(data.map((tenant) => buildTenantSummary(tenant)));
      res.json({ data: enriched });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/super/tenants/:tenantId", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string, 10);
      const tenant = await storage.getTenantById(tenantId);
      if (!tenant) return res.status(404).json({ error: "Negocio no encontrado" });
      const data = await buildTenantSummary(tenant);
      return res.json({ data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/super/tenants", superAuth, async (req, res) => {
    try {
      const { code, name, planId, adminEmail, adminPassword, adminName } = createTenantSchema.parse(req.body);
      if (!code || !name || !adminEmail || !adminPassword || !adminName) {
        return res.status(400).json({ error: "Campos requeridos faltantes" });
      }
      const existing = await storage.getTenantByCode(code);
      if (existing) {
        return res.status(400).json({ error: "Código de negocio ya existe" });
      }
      const tenant = await storage.createTenant({
        code,
        name,
        slug: code,
        planId: planId || null,
        isActive: true,
      });
      const hashedPassword = await hashPassword(adminPassword);
      await storage.createUser({
        tenantId: tenant.id,
        email: adminEmail,
        password: hashedPassword,
        fullName: adminName,
        role: "admin",
        isActive: true,
        isSuperAdmin: false,
      });
      await storage.upsertConfig({
        tenantId: tenant.id,
        businessName: name,
        currency: "ARS",
        trackingExpirationHours: 24,
        language: "es",
      });
      const defaultStatuses = [
        { name: "Pendiente", color: "#F59E0B", sortOrder: 0, isFinal: false },
        { name: "En Proceso", color: "#3B82F6", sortOrder: 1, isFinal: false },
        { name: "Listo", color: "#8B5CF6", sortOrder: 2, isFinal: false },
        { name: "Entregado", color: "#10B981", sortOrder: 3, isFinal: true },
        { name: "Cancelado", color: "#EF4444", sortOrder: 4, isFinal: true },
      ];
      for (const s of defaultStatuses) {
        await storage.createOrderStatus({ tenantId: tenant.id, ...s });
      }
      res.status(201).json({ data: tenant });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/super/tenants/:tenantId/plan", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { planId } = planUpdateSchema.parse(req.body);
      await storage.updateTenantPlan(tenantId, planId);
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/super/tenants/:tenantId/addons", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const addons = await storage.getTenantAddons(tenantId);
      res.json({ data: addons });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/super/tenants/:tenantId/addons", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { addonKey, enabled } = req.body;
      if (!addonKey) return res.status(400).json({ error: "addonKey requerido" });
      const addon = await storage.upsertTenantAddon({
        tenantId,
        addonKey,
        enabled: enabled ?? true,
        enabledById: req.auth!.userId,
        enabledAt: enabled ? new Date() : null,
      });
      res.json({ data: addon });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/super/tenants/:tenantId/addons/:addonKey", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const addonKey = req.params.addonKey as string;
      const { enabled } = req.body;
      if (enabled === undefined) return res.status(400).json({ error: "enabled requerido" });
      const addon = await storage.upsertTenantAddon({
        tenantId,
        addonKey,
        enabled,
        enabledById: req.auth!.userId,
        enabledAt: enabled ? new Date() : null,
      });
      res.json({ data: addon });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/super/tenants/:tenantId/subscription", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { startDate, endDate } = req.body;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate y endDate requeridos" });
      }
      await storage.updateTenantSubscription(tenantId, new Date(startDate), new Date(endDate));
      await storage.updateTenantActive(tenantId, true);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/super/tenants/:tenantId/block", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { blocked } = blockSchema.parse(req.body);
      await storage.updateTenantBlocked(tenantId, blocked);
      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: blocked ? "TENANT_BLOCKED" : "TENANT_UNBLOCKED",
        entityType: "TENANT",
        entityId: tenantId,
        changes: { blocked },
      });
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/super/tenants/:tenantId/block", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string, 10);
      const { blocked } = blockTenantBodySchema.parse(req.body || {});
      await storage.updateTenantBlocked(tenantId, blocked);
      if (blocked) await storage.updateTenantActive(tenantId, false);
      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: blocked ? "TENANT_BLOCKED" : "TENANT_UNBLOCKED",
        entityType: "TENANT",
        entityId: tenantId,
        changes: { blocked },
      });
      return res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/super/tenants/:tenantId/rename", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { name } = renameSchema.parse(req.body);
      await storage.updateTenantName(tenantId, name);
      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: "TENANT_RENAMED",
        entityType: "TENANT",
        entityId: tenantId,
        changes: { name },
      });
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/super/tenants/:tenantId/reset-password", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string, 10);
      const tenant = await storage.getTenantById(tenantId);
      if (!tenant) return res.status(404).json({ error: "Negocio no encontrado" });

      const admin = await storage.getPrimaryTenantAdmin(tenantId);
      if (!admin) return res.status(404).json({ error: "No se encontró admin principal" });

      const tempPassword = generateStrongTempPassword();
      const hashedPassword = await hashPassword(tempPassword);
      await storage.updateUser(admin.id, tenantId, { password: hashedPassword });

      const isProd = process.env.NODE_ENV === "production";
      const configured = isMailerConfigured();
      let mailSent = false;
      if (configured) {
        try {
          await sendMail({
            to: admin.email,
            subject: `Reset de contraseña - ${tenant.name}`,
            html: `<p>Se reseteó la contraseña del negocio <b>${tenant.name}</b>.</p><p>Contraseña temporal: <b>${tempPassword}</b></p><p>Te recomendamos cambiarla al iniciar sesión.</p>`,
            text: `Se reseteó la contraseña del negocio ${tenant.name}. Contraseña temporal: ${tempPassword}`,
          });
          mailSent = true;
        } catch (mailErr: any) {
          return res.status(500).json({ error: `No se pudo enviar mail: ${mailErr?.message || "MAIL_ERROR"}` });
        }
      }

      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: "TENANT_ADMIN_PASSWORD_RESET",
        entityType: "USER",
        entityId: admin.id,
        metadata: { adminEmail: admin.email, mailSent },
      });

      if (isProd && !mailSent) {
        return res.status(500).json({ error: "Mailer no configurado en producción" });
      }

      return res.json({ ok: true, tempPassword: isProd ? undefined : tempPassword, mailSent });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });


  app.post("/api/super/tenants/:tenantId/admin/set-password", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { newPassword } = setPasswordSchema.parse(req.body);
      const admin = await storage.getPrimaryTenantAdmin(tenantId);
      if (!admin) {
        return res.status(404).json({ error: "No se encontró un admin principal" });
      }
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(admin.id, tenantId, { password: hashedPassword });
      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: "TENANT_ADMIN_PASSWORD_SET",
        entityType: "USER",
        entityId: admin.id,
        metadata: { adminEmail: admin.email },
      });
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/super/tenants/:tenantId", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { confirmText } = deleteSchema.parse(req.body);
      const tenant = await storage.getTenantById(tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Negocio no encontrado" });
      }
      const confirmValue = confirmText.trim().toLowerCase();
      const valid = confirmValue === tenant.code.toLowerCase() || confirmValue === tenant.name.toLowerCase();
      if (!valid) {
        return res.status(400).json({ error: "Confirmación inválida" });
      }
      await storage.softDeleteTenant(tenantId);
      await storage.updateTenantActive(tenantId, false);
      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: "TENANT_DELETED",
        entityType: "TENANT",
        entityId: tenantId,
        metadata: { confirmText: tenant.code },
      });
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/super/config", superAuth, async (req, res) => {
    try {
      const config = await storage.getSuperAdminConfig(req.auth!.userId);
      res.json({ data: config || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/super/security", superAuth, async (req, res) => {
    try {
      const [totp] = await db.select().from(superAdminTotp).where(eq(superAdminTotp.superAdminId, req.auth!.userId)).limit(1);
      const user = await storage.getSuperAdminByEmail(req.auth!.email);
      return res.json({
        data: {
          email: user?.email || req.auth!.email,
          twoFactorEnabled: !!totp?.enabled,
          twoFactorVerifiedAt: totp?.verifiedAt || null,
        },
      });
    } catch {
      return res.status(500).json({ error: "No se pudo cargar seguridad", code: "SUPER_SECURITY_READ_ERROR" });
    }
  });

  app.put("/api/super/credentials", superAuth, async (req, res) => {
    try {
      const { currentPassword, newEmail, newPassword } = updateSuperCredentialsSchema.parse(req.body || {});
      const user = await storage.getSuperAdminByEmail(req.auth!.email);
      if (!user) {
        return res.status(404).json({ error: "Super admin no encontrado", code: "SUPERADMIN_NOT_FOUND" });
      }
      const ok = await comparePassword(currentPassword, user.password);
      if (!ok) {
        return res.status(401).json({ error: "La contraseña actual es incorrecta", code: "SUPERADMIN_CURRENT_PASSWORD_INVALID" });
      }

      const payload: any = {};
      if (newEmail && newEmail !== user.email) {
        payload.email = newEmail;
      }
      if (newPassword) {
        payload.password = await hashPassword(newPassword);
      }

      if (!Object.keys(payload).length) {
        return res.status(400).json({ error: "No hay cambios para guardar", code: "SUPERADMIN_NO_CHANGES" });
      }

      await db.update(users).set(payload).where(eq(users.id, user.id));
      await db.insert(superAdminAuditLogs).values({
        superAdminId: user.id,
        action: "SUPERADMIN_CREDENTIALS_UPDATED",
        metadata: { changedEmail: !!payload.email, changedPassword: !!payload.password },
      });

      return res.json({ ok: true, code: "SUPERADMIN_CREDENTIALS_UPDATED" });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "SUPERADMIN_CREDENTIALS_INVALID", details: err.errors });
      }
      return res.status(500).json({ error: "No se pudieron actualizar credenciales", code: "SUPERADMIN_CREDENTIALS_ERROR" });
    }
  });

  app.post("/api/super/2fa/setup", superAuth, async (req, res) => {
    try {
      const { accountLabel } = setup2faSchema.parse(req.body || {});
      const user = await storage.getSuperAdminByEmail(req.auth!.email);
      if (!user) return res.status(404).json({ error: "Super admin no encontrado", code: "SUPERADMIN_NOT_FOUND" });

      const secret = generateSecret();
      const label = (accountLabel || user.email).trim();
      const issuer = "Orbia Admin";
      const otpauthUrl = generateURI({
        strategy: "totp",
        label,
        issuer,
        secret,
        algorithm: "sha1",
        digits: 6,
        period: 30,
      });
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 280,
      });

      await db
        .insert(superAdminTotp)
        .values({ superAdminId: user.id, secret, enabled: false, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [superAdminTotp.superAdminId],
          set: { secret, enabled: false, verifiedAt: null, updatedAt: new Date() },
        });

      await db.insert(superAdminAuditLogs).values({
        superAdminId: user.id,
        action: "SUPERADMIN_2FA_SETUP",
        metadata: { label },
      });

      return res.json({ data: { otpauthUrl, qrDataUrl, manualSecret: secret, issuer, account: label } });
    } catch {
      return res.status(500).json({ error: "No se pudo iniciar configuración de 2FA", code: "SUPERADMIN_2FA_SETUP_ERROR" });
    }
  });

  app.post("/api/super/2fa/verify", superAuth, async (req, res) => {
    try {
      const { token } = verify2faSchema.parse(req.body || {});
      const [totp] = await db.select().from(superAdminTotp).where(eq(superAdminTotp.superAdminId, req.auth!.userId)).limit(1);
      if (!totp) {
        return res.status(400).json({ error: "Primero configurá 2FA", code: "SUPERADMIN_2FA_NOT_SETUP" });
      }
      if (!totp.secret || !totp.secret.trim()) {
        return res.status(401).json({ error: "2FA inválido: secreto no configurado", code: "SUPERADMIN_2FA_MISCONFIGURED" });
      }
      const normalizedToken = String(token || "").trim();
      if (!/^\d{6,8}$/.test(normalizedToken)) {
        return res.status(401).json({ error: "Código inválido", code: "SUPERADMIN_2FA_INVALID" });
      }
      if (!(await verifyTotp({ token: normalizedToken, secret: totp.secret, strategy: "totp", window: 1 } as any))) {
        return res.status(401).json({ error: "Código inválido", code: "SUPERADMIN_2FA_INVALID" });
      }
      await db.update(superAdminTotp).set({ enabled: true, verifiedAt: new Date(), updatedAt: new Date() }).where(eq(superAdminTotp.superAdminId, req.auth!.userId));
      await db.insert(superAdminAuditLogs).values({ superAdminId: req.auth!.userId, action: "SUPERADMIN_2FA_ENABLED", metadata: {} });
      return res.json({ ok: true, code: "SUPERADMIN_2FA_ENABLED" });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Token inválido", code: "SUPERADMIN_2FA_VERIFY_INVALID" });
      }
      return res.status(500).json({ error: "No se pudo verificar 2FA", code: "SUPERADMIN_2FA_VERIFY_ERROR" });
    }
  });

  app.post("/api/super/2fa/disable", superAuth, async (req, res) => {
    try {
      const { currentPassword, token } = disable2faSchema.parse(req.body || {});
      const user = await storage.getSuperAdminByEmail(req.auth!.email);
      if (!user) return res.status(404).json({ error: "Super admin no encontrado", code: "SUPERADMIN_NOT_FOUND" });
      const passwordOk = await comparePassword(currentPassword, user.password);
      if (!passwordOk) {
        return res.status(401).json({ error: "La contraseña actual es incorrecta", code: "SUPERADMIN_CURRENT_PASSWORD_INVALID" });
      }

      const [totp] = await db.select().from(superAdminTotp).where(eq(superAdminTotp.superAdminId, user.id)).limit(1);
      if (!totp?.enabled) {
        return res.status(400).json({ error: "2FA no está habilitado", code: "SUPERADMIN_2FA_NOT_ENABLED" });
      }
      if (!totp.secret || !totp.secret.trim()) {
        return res.status(401).json({ error: "2FA inválido: secreto no configurado", code: "SUPERADMIN_2FA_MISCONFIGURED" });
      }
      const normalizedToken = String(token || "").trim();
      if (!/^\d{6,8}$/.test(normalizedToken)) {
        return res.status(401).json({ error: "Código inválido", code: "SUPERADMIN_2FA_INVALID" });
      }
      if (!(await verifyTotp({ token: normalizedToken, secret: totp.secret, strategy: "totp", window: 1 } as any))) {
        return res.status(401).json({ error: "Código inválido", code: "SUPERADMIN_2FA_INVALID" });
      }

      await db.update(superAdminTotp).set({ enabled: false, updatedAt: new Date() }).where(eq(superAdminTotp.superAdminId, user.id));
      await db.insert(superAdminAuditLogs).values({ superAdminId: user.id, action: "SUPERADMIN_2FA_DISABLED", metadata: {} });
      return res.json({ ok: true, code: "SUPERADMIN_2FA_DISABLED" });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "SUPERADMIN_2FA_DISABLE_INVALID" });
      }
      return res.status(500).json({ error: "No se pudo desactivar 2FA", code: "SUPERADMIN_2FA_DISABLE_ERROR" });
    }
  });



  const mailSendLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: parseInt(process.env.SUPER_EMAILS_LIMIT_PER_MIN || "3", 10),
    keyGenerator: (req) => `super-email:${req.auth?.userId || req.ip}`,
    errorMessage: "Demasiados envíos de correo. Intentá nuevamente en un minuto.",
    code: "SUPER_EMAIL_RATE_LIMIT",
  });

  app.post("/api/super/emails/send", superAuth, mailSendLimiter, async (req, res) => {
    try {
      const payload = sendEmailSchema.parse(req.body || {});
      const tenants = await storage.getTenants();
      const recipientsPool = tenants.filter((t) => !t.deletedAt && !t.isBlocked && t.isActive);

      const targetTenants = payload.sendToAll
        ? recipientsPool
        : recipientsPool.filter((t) => payload.tenantIds.includes(t.id));

      if (!targetTenants.length) {
        return res.status(400).json({ error: "No hay destinatarios válidos" });
      }

      if (!payload.sendToAll && payload.tenantIds.length === 0) {
        return res.status(400).json({ error: "tenantIds requerido cuando sendToAll=false" });
      }

      if (!isMailerConfigured()) {
        return res.status(400).json({ error: "Mailer no configurado" });
      }

      const [campaign] = await db
        .insert(emailCampaigns)
        .values({
          createdByUserId: req.auth!.userId,
          subject: payload.subject,
          html: payload.html,
          text: payload.text || null,
          sendToAll: payload.sendToAll,
          requestedTenantIdsJson: payload.tenantIds,
          status: "PENDING",
          totalRecipients: targetTenants.length,
        })
        .returning();

      let sent = 0;
      let failed = 0;
      const failures: Array<{ tenantId: number; email: string; error: string }> = [];

      for (const tenant of targetTenants) {
        const owner = await storage.getPrimaryTenantAdmin(tenant.id);
        const toEmail = owner?.email || null;

        if (!toEmail) {
          failed += 1;
          failures.push({ tenantId: tenant.id, email: "", error: "No se encontró email del admin principal" });
          await db.insert(emailDeliveryLogs).values({
            campaignId: campaign.id,
            tenantId: tenant.id,
            toEmail: "",
            status: "FAILED",
            errorMessage: "No se encontró email del admin principal",
          });
          continue;
        }

        try {
          await sendMail({ to: toEmail, subject: payload.subject, html: payload.html, text: payload.text });
          sent += 1;
          await db.insert(emailDeliveryLogs).values({
            campaignId: campaign.id,
            tenantId: tenant.id,
            toEmail,
            status: "SENT",
            errorMessage: null,
          });
        } catch (err: any) {
          failed += 1;
          const msg = String(err?.message || "SEND_FAILED").slice(0, 400);
          failures.push({ tenantId: tenant.id, email: toEmail, error: msg });
          await db.insert(emailDeliveryLogs).values({
            campaignId: campaign.id,
            tenantId: tenant.id,
            toEmail,
            status: "FAILED",
            errorMessage: msg,
          });
        }

        await sleep(200);
      }

      const status = failed === 0 ? "SENT" : sent > 0 ? "PARTIAL" : "FAILED";
      await db
        .update(emailCampaigns)
        .set({ status, successCount: sent, failureCount: failed })
        .where(eq(emailCampaigns.id, campaign.id));

      return res.json({ campaignId: campaign.id, sent, failed, failures });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      return res.status(500).json({ error: err.message || "No se pudo enviar correos" });
    }
  });

  app.post(
    "/api/super/config/avatar",
    superAuth,
    avatarUploadLimiter,
    handleSingleUpload(profileUpload, "avatar"),
    async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No se subió archivo" });
      const avatarUrl = `/uploads/profiles/${req.file.filename}`;
      const config = await storage.upsertSuperAdminConfig({
        userId: req.auth!.userId,
        avatarUrl,
      });
      const versionedUrl = `${avatarUrl}?v=${new Date().getTime()}`;
      res.json({ data: { ...config, avatarUrl: versionedUrl } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
