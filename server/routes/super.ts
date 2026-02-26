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
import { getTenantAddons as getTenantAddonsFlags, setTenantAddon } from "../services/tenant-addons";

const createTenantSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(80),
  planId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.coerce.number().int().positive().nullable()
  ).optional(),
  adminEmail: z.string().trim().email().max(120),
  adminPassword: z.string().min(6).max(256),
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

const updateCodeSchema = z.object({
  code: z.string().trim().min(2).max(40),
});

const updateAdminEmailSchema = z.object({
  email: z.string().trim().email().max(120),
});

const setPasswordSchema = z.object({
  newPassword: z.string().min(6).max(256),
});

const deleteSchema = z.object({
  confirmText: z.string().trim().min(2).max(200),
});

const updateSuperCredentialsSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  newEmail: z.string().trim().email().max(120).optional(),
  newPassword: z.string().min(6).max(256).optional(),
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


const planPatchSchema = z.object({
  description: z.string().trim().max(500).optional(),
  priceAmount: z.coerce.number().min(0).optional(),
  currency: z.string().trim().max(10).optional(),
  maxBranches: z.coerce.number().int().min(0).max(999).optional(),
  allowCashiers: z.boolean().optional(),
  allowMarginPricing: z.boolean().optional(),
  allowExcelImport: z.boolean().optional(),
  allowCustomTos: z.boolean().optional(),
  featuresJson: z.record(z.boolean()).optional(),
});

const planPutSchema = z.object({
  priceMonthly: z.coerce.number().min(0).max(999999999).optional(),
  description: z.string().trim().max(500).optional(),
  limits: z.record(z.number()).optional(),
});

const subscriptionPatchSchema = z.object({
  planCode: z.string().trim().min(2).max(50),
  status: z.enum(["ACTIVE", "EXPIRED", "SUSPENDED"]),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
});

const transferInfoSchema = z.object({
  bank_name: z.string().trim().max(120),
  account_holder: z.string().trim().max(120),
  cbu: z.string().trim().max(40),
  alias: z.string().trim().max(120),
  whatsapp_contact: z.string().trim().max(50),
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

  app.patch("/api/super/plans/:code", superAuth, async (req, res) => {
    try {
      const code = String(req.params.code || "").trim().toUpperCase();
      const payload = planPatchSchema.parse(req.body || {});
      const updated = await storage.updatePlanByCode(code, {
        description: payload.description,
        priceMonthly: payload.priceAmount !== undefined ? String(payload.priceAmount) : undefined,
        currency: payload.currency,
        maxBranches: payload.maxBranches,
        allowCashiers: payload.allowCashiers,
        allowMarginPricing: payload.allowMarginPricing,
        allowExcelImport: payload.allowExcelImport,
        allowCustomTos: payload.allowCustomTos,
        featuresJson: payload.featuresJson,
      } as any);
      if (!updated) return res.status(404).json({ error: "Plan no encontrado", code: "PLAN_NOT_FOUND" });
      res.json({ data: updated });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", code: "VALIDATION_ERROR", details: err.errors });
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/super/plans/:planCode", superAuth, async (req, res) => {
    try {
      const planCode = String(req.params.planCode || "").trim().toUpperCase();
      const payload = planPutSchema.parse(req.body || {});
      const updated = await storage.updatePlanByCode(planCode, {
        description: payload.description,
        priceMonthly: payload.priceMonthly !== undefined ? String(payload.priceMonthly) : undefined,
        limitsJson: payload.limits,
      } as any);
      if (!updated) {
        return res.status(404).json({ error: "Plan no encontrado", code: "PLAN_NOT_FOUND" });
      }
      return res.json({ data: updated });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Payload inválido", code: "PLAN_PAYLOAD_INVALID", details: err.errors });
      }
      return res.status(500).json({ error: err.message || "No se pudo actualizar plan" });
    }
  });

  app.get("/api/super/subscriptions", superAuth, async (_req, res) => {
    try {
      const data = await storage.listSubscriptions();
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/super/subscriptions/:tenantId", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string, 10);
      const payload = subscriptionPatchSchema.parse(req.body || {});
      const sub = await storage.updateSubscription(tenantId, {
        planCode: payload.planCode.toUpperCase(),
        status: payload.status,
        startsAt: payload.startsAt ? new Date(payload.startsAt) : new Date(),
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      });
      const plans = await storage.getPlans();
      const plan = plans.find((p) => p.planCode === payload.planCode.toUpperCase());
      if (plan) {
        await storage.updateTenantPlan(tenantId, plan.id);
      }
      await storage.updateTenantSubscription(tenantId, sub.startsAt, sub.expiresAt || sub.startsAt);
      await storage.updateTenantActive(tenantId, payload.status === "ACTIVE");
      res.json({ data: sub });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", code: "VALIDATION_ERROR", details: err.errors });
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/super/transfer-info", superAuth, async (_req, res) => {
    try {
      const row = await storage.getSystemSetting("transfer_info");
      const data = row?.value ? JSON.parse(row.value) : null;
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/super/transfer-info", superAuth, async (req, res) => {
    try {
      const payload = transferInfoSchema.parse(req.body || {});
      const row = await storage.upsertSystemSetting("transfer_info", JSON.stringify(payload));
      res.json({ data: row?.value ? JSON.parse(row.value) : payload });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", code: "VALIDATION_ERROR", details: err.errors });
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
      const hashedPassword = await hashPassword(adminPassword);
      const tenant = await storage.createTenant({
        code,
        name,
        slug: code,
        planId: planId || null,
        isActive: true,
      });
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
      res.status(201).json({
        data: tenant,
        admin: { email: adminEmail, fullName: adminName },
        credentials: { code, adminEmail, adminPassword },
      });
    } catch (err: any) {
      console.error("[SUPER ADMIN CREATE TENANT ERROR]", err?.message || err, err?.details || err?.errors);
      if (err instanceof z.ZodError) {
        const issues = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ error: `Datos inválidos: ${issues}`, details: err.errors });
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
      const addons = await getTenantAddonsFlags(tenantId);
      res.json({ addons });
    } catch (err: any) {
      console.error("[super] SUPER_TENANT_ADDONS_ERROR", err);
      res.status(500).json({ error: "No se pudieron obtener addons", code: "SUPER_TENANT_ADDONS_ERROR" });
    }
  });

  app.put("/api/super/tenants/:tenantId/addons", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const payload = z.object({ addons: z.record(z.boolean()) }).parse(req.body);
      const allowed = new Set(["barcode_scanner", "delivery", "messaging_whatsapp"]);
      for (const [addonCode, enabled] of Object.entries(payload.addons || {})) {
        if (!allowed.has(addonCode)) continue;
        await setTenantAddon(tenantId, addonCode, Boolean(enabled), req.auth?.userId ?? null);
      }
      const addons = await getTenantAddonsFlags(tenantId);
      return res.json({ addons });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "INVALID_ADDONS_PAYLOAD", details: err.errors });
      }
      console.error("[super] SUPER_TENANT_ADDONS_UPDATE_ERROR", err);
      return res.status(500).json({ error: "No se pudieron guardar addons", code: "SUPER_TENANT_ADDONS_UPDATE_ERROR" });
    }
  });

  app.post("/api/super/tenants/:tenantId/addons", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { addonKey, enabled } = req.body;
      if (!addonKey) return res.status(400).json({ error: "addonKey requerido" });
      const addon = await setTenantAddon(tenantId, addonKey, enabled ?? true, req.auth?.userId ?? null);
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
      const addon = await setTenantAddon(tenantId, addonKey, enabled, req.auth?.userId ?? null);
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

  app.patch("/api/super/tenants/:tenantId/code", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { code } = updateCodeSchema.parse(req.body);
      const existing = await storage.getTenantByCode(code);
      if (existing && existing.id !== tenantId) {
        return res.status(400).json({ error: "Código de negocio ya existe", code: "TENANT_CODE_TAKEN" });
      }
      await storage.updateTenantCode(tenantId, code);
      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: "TENANT_CODE_CHANGED",
        entityType: "TENANT",
        entityId: tenantId,
        changes: { code },
      });
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/super/tenants/:tenantId/admin/email", superAuth, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const { email } = updateAdminEmailSchema.parse(req.body);
      const admin = await storage.getPrimaryTenantAdmin(tenantId);
      if (!admin) {
        return res.status(404).json({ error: "No se encontró admin principal" });
      }
      await storage.updateUser(admin.id, tenantId, { email });
      await storage.createAuditLog({
        tenantId,
        userId: req.auth!.userId,
        action: "TENANT_ADMIN_EMAIL_CHANGED",
        entityType: "USER",
        entityId: admin.id,
        changes: { email },
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
      const tenant = await storage.getTenantById(tenantId);
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

  function sanitizeHtmlLite(html: string) {
    return String(html || "")
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/on\w+\s*=\s*'[^']*'/gi, "");
  }

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

      const [campaign] = await db
        .insert(emailCampaigns)
        .values({
          createdByUserId: req.auth!.userId,
          subject: payload.subject,
          html: sanitizeHtmlLite(payload.html),
          text: payload.text || null,
          sendToAll: payload.sendToAll,
          requestedTenantIdsJson: payload.tenantIds,
          status: "PENDING",
          totalRecipients: targetTenants.length,
        })
        .returning();

      const configured = isMailerConfigured();
      let sent = 0;
      let failed = 0;
      let skipped = 0;
      const failures: Array<{ tenantId: number; email: string; error: string }> = [];

      const batchSize = Math.max(1, parseInt(process.env.EMAIL_BATCH_SIZE || "50", 10));
      const batchDelayMs = Math.max(0, parseInt(process.env.EMAIL_BATCH_DELAY_MS || "500", 10));

      for (let i = 0; i < targetTenants.length; i += batchSize) {
        const chunk = targetTenants.slice(i, i + batchSize);
        console.log(`[mail] campaign=${campaign.id} chunk=${Math.floor(i / batchSize) + 1} size=${chunk.length}`);

        for (const tenant of chunk) {
          const owner = await storage.getPrimaryTenantAdmin(tenant.id);
          const toEmail = owner?.email || "";

          if (!toEmail) {
            failed += 1;
            const msg = "No se encontró email del admin principal";
            failures.push({ tenantId: tenant.id, email: "", error: msg });
            await db.insert(emailDeliveryLogs).values({
              campaignId: campaign.id,
              tenantId: tenant.id,
              toEmail: "",
              status: "FAILED",
              errorMessage: msg,
            });
            continue;
          }

          if (!configured) {
            skipped += 1;
            await db.insert(emailDeliveryLogs).values({
              campaignId: campaign.id,
              tenantId: tenant.id,
              toEmail,
              status: "SKIPPED" as any,
              errorMessage: "Mailer no configurado",
            });
            continue;
          }

          try {
            try {
              await sendMail({ to: toEmail, subject: payload.subject, html: sanitizeHtmlLite(payload.html), text: payload.text });
            } catch (firstErr: any) {
              const msg = String(firstErr?.message || "").toLowerCase();
              const isRate = msg.includes("rate") || msg.includes("quota") || msg.includes("429");
              if (!isRate) throw firstErr;
              await sleep(2000);
              await sendMail({ to: toEmail, subject: payload.subject, html: sanitizeHtmlLite(payload.html), text: payload.text });
            }

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
        }

        if (i + batchSize < targetTenants.length) {
          await sleep(batchDelayMs);
        }
      }

      const status = !configured
        ? "PARTIAL"
        : failed === 0
          ? "SENT"
          : sent > 0
            ? "PARTIAL"
            : "FAILED";

      await db
        .update(emailCampaigns)
        .set({ status, successCount: sent, failureCount: failed + skipped })
        .where(eq(emailCampaigns.id, campaign.id));

      return res.status(configured ? 200 : 503).json({
        campaignId: campaign.id,
        sent,
        failed,
        skipped,
        failures,
        message: configured ? undefined : "Mailer no configurado",
      });
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
