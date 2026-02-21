import type { Express } from "express";
import { storage } from "../storage";
import { tenantAuth, getTenantPlan, enforceBranchScope, blockBranchScope, requireTenantAdmin, comparePassword } from "../auth";
import { profileUpload } from "./uploads";
import { handleSingleUpload } from "../middleware/upload-guards";
import { createRateLimiter } from "../middleware/rate-limit";
import { z } from "zod";
import { getTenantMonthlyMetricsSummary } from "../services/metrics-refresh";
import bcrypt from "bcryptjs";
import { deleteTenantAtomic, generateTenantExportZip, validateExportToken } from "../services/tenant-account";
import { evaluatePassword } from "../services/password-policy";
import { getPasswordWeakFlag, setPasswordWeakFlag } from "../services/password-weak-cache";


const changePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  newPassword: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256),
});

const deleteTenantSchema = z.object({
  confirm: z.string().trim(),
  password: z.string().min(6).max(128),
  exportBeforeDelete: z.boolean().optional().default(false),
});

const tenantConfigSchema = z.object({
  businessName: z.string().trim().max(80).optional(),
  businessType: z.string().trim().max(80).optional(),
  businessDescription: z.string().trim().max(500).optional(),
  currency: z.string().trim().max(10).optional(),
  trackingExpirationHours: z.coerce.number().int().min(1).max(168).optional(),
  language: z.string().trim().max(10).optional(),
  trackingLayout: z.string().trim().max(40).optional(),
  trackingPrimaryColor: z.string().trim().max(30).optional(),
  trackingAccentColor: z.string().trim().max(30).optional(),
  trackingBgColor: z.string().trim().max(30).optional(),
  trackingTosText: z.string().trim().max(200).optional(),
});

export function registerTenantRoutes(app: Express) {
  const sensitiveActionLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => `tenant-sensitive:${req.ip}:${req.path}`,
    errorMessage: "Demasiados intentos. Reintentá más tarde.",
    code: "RATE_LIMITED",
    onLimit: async ({ req, retryAfterSec }) => {
      if (!req.auth?.tenantId) return;
      await storage.createAuditLog({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId || null,
        action: "brute_force_blocked",
        entityType: "auth",
        metadata: { route: req.path, ip: req.ip, retryAfterSec },
      }).catch(() => undefined);
    },
  });

  const logoUploadLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: parseInt(process.env.UPLOADS_LIMIT_PER_MIN || "6", 10),
    keyGenerator: (req) => `tenant-logo:${req.auth?.userId || req.ip}`,
    errorMessage: "Demasiadas subidas. Intentá en un minuto.",
    code: "UPLOAD_RATE_LIMIT",
  });
  app.get("/api/me", tenantAuth, async (req, res) => {
    try {
      const user = await storage.getUserById(req.auth!.userId, req.auth!.tenantId!);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
      res.json({
        data: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          scope: user.scope || "TENANT",
          tenantId: user.tenantId,
          branchId: user.branchId,
          avatarUrl: user.avatarUrl || null,
          passwordWeak: user.role !== "CASHIER" ? getPasswordWeakFlag(user.id) : false,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/me/password", tenantAuth, sensitiveActionLimiter, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = changePasswordSchema.parse(req.body || {});
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "La confirmación no coincide", code: "PASSWORD_MISMATCH" });
      }
      const tenant = await storage.getTenantById(req.auth!.tenantId!);
      const user = await storage.getUserById(req.auth!.userId, req.auth!.tenantId!);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
      const ok = await comparePassword(currentPassword, user.password);
      if (!ok) return res.status(401).json({ error: "La contraseña actual es incorrecta", code: "CURRENT_PASSWORD_INVALID" });
      const evaluation = evaluatePassword(newPassword, {
        dni: user.email,
        email: user.email,
        tenantCode: tenant?.code,
        tenantName: tenant?.name,
      });
      if (!evaluation.isValid) {
        await storage.createAuditLog({
          tenantId: req.auth!.tenantId!,
          userId: req.auth!.userId,
          action: "password_change_fail_policy",
          entityType: "auth",
          metadata: { score: evaluation.score, warnings: evaluation.warnings },
        });
        return res.status(400).json({ error: "La contraseña no cumple la política", code: "PASSWORD_POLICY_FAILED", details: evaluation });
      }
      const hashed = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(user.id, req.auth!.tenantId!, { password: hashed });
      setPasswordWeakFlag(user.id, false);
      await storage.createAuditLog({
        tenantId: req.auth!.tenantId!,
        userId: req.auth!.userId,
        action: "password_change_success",
        entityType: "auth",
      });
      return res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "PASSWORD_INVALID" });
      }
      return res.status(500).json({ error: "No se pudo cambiar la contraseña", code: "PASSWORD_CHANGE_ERROR" });
    }
  });


  app.get("/api/tenant/info", tenantAuth, async (req, res) => {
    try {
      const tenant = await storage.getTenantById(req.auth!.tenantId!);
      if (!tenant) return res.status(404).json({ error: "Negocio no encontrado", code: "TENANT_NOT_FOUND" });
      res.json({ data: { id: tenant.id, code: tenant.code, name: tenant.name } });
    } catch (err: any) {
      res.status(500).json({ error: "No se pudo obtener información del negocio", code: "TENANT_INFO_ERROR" });
    }
  });

  app.get("/api/me/plan", tenantAuth, async (req, res) => {
    try {
      const plan = await getTenantPlan(req.auth!.tenantId!);
      const tenant = await storage.getTenantById(req.auth!.tenantId!);
      const plans = await storage.getPlans();
      const dbPlan = plans.find((p) => p.id === tenant?.planId);
      res.json({ data: plan ? { ...plan, description: (dbPlan as any)?.description || null, priceMonthly: (dbPlan as any)?.priceMonthly || null, currency: (dbPlan as any)?.currency || "ARS" } : null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  app.put("/api/me/profile", tenantAuth, async (req, res) => {
    try {
      const avatarUrl = typeof req.body?.avatarUrl === "string" ? req.body.avatarUrl.trim() : undefined;
      const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : undefined;
      const payload: any = {};
      if (avatarUrl !== undefined) {
        payload.avatarUrl = avatarUrl || null;
        payload.avatarUpdatedAt = new Date();
      }
      if (fullName) payload.fullName = fullName;
      if (!Object.keys(payload).length) {
        return res.status(400).json({ error: "Sin cambios para guardar", code: "PROFILE_NO_CHANGES" });
      }
      const user = await storage.updateUser(req.auth!.userId, req.auth!.tenantId!, payload);
      res.json({ data: { id: user.id, fullName: user.fullName, avatarUrl: user.avatarUrl, avatarUpdatedAt: user.avatarUpdatedAt } });
    } catch (err: any) {
      res.status(500).json({ error: "No se pudo actualizar el perfil", code: "PROFILE_UPDATE_ERROR" });
    }
  });

  app.get("/api/config", tenantAuth, async (req, res) => {
    try {
      const config = await storage.getConfig(req.auth!.tenantId!);
      res.json({ data: config || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/config", tenantAuth, requireTenantAdmin, blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const payload = tenantConfigSchema.parse(req.body);
      const plan = await getTenantPlan(tenantId);
      if (plan && payload.trackingExpirationHours !== undefined) {
        const hours = parseInt(String(payload.trackingExpirationHours));
        const minH = plan.limits.tracking_retention_min_hours || 1;
        const maxH = plan.limits.tracking_retention_max_hours || 24;
        if (hours < minH || hours > maxH) {
          return res.status(400).json({
            error: `Tu plan "${plan.name}" permite entre ${minH}h y ${maxH}h de retención de tracking.`,
            code: "LIMIT_EXCEEDED",
            min: minH,
            max: maxH,
          });
        }
      }
      const config = await storage.upsertConfig({
        tenantId,
        ...payload,
      });
      res.json({ data: config });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: err.errors });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/dashboard/stats", tenantAuth, enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : null;
      const monthlySummary = !branchId ? await getTenantMonthlyMetricsSummary(tenantId) : null;
      const [totalOrders, totalProducts, monthlyIncomeRaw, monthlyExpensesRaw, todayIncome, todayExpenses] =
        await Promise.all([
          storage.countOrders(tenantId, branchId),
          storage.countProducts(tenantId),
          storage.getMonthlyIncome(tenantId, branchId),
          storage.getMonthlyExpenses(tenantId, branchId),
          storage.getTodayIncome(tenantId, branchId),
          storage.getTodayExpenses(tenantId, branchId),
        ]);
      const monthlyIncome = monthlySummary ? monthlySummary.cashInTotal : monthlyIncomeRaw;
      const monthlyExpenses = monthlySummary ? monthlySummary.cashOutTotal : monthlyExpensesRaw;
      let allOrders;
      if (branchId) {
        allOrders = await storage.getOrdersByBranch(tenantId, branchId);
      } else {
        allOrders = await storage.getOrders(tenantId);
      }
      const statuses = await storage.getOrderStatuses(tenantId);
      const pendingLikeStatusIds = new Set(
        statuses
          .filter((s) => {
            const normalized = (s.name || "").trim().toUpperCase();
            return normalized === "PENDIENTE" || normalized === "EN_PROCESO" || normalized === "EN PROCESO";
          })
          .map((s) => s.id)
      );
      const openOrders = allOrders.filter((o) => o.statusId && pendingLikeStatusIds.has(o.statusId)).length;

      res.json({
        data: {
          totalOrders,
          openOrders,
          todayIncome,
          todayExpenses,
          totalProducts,
          monthlyIncome,
          monthlyExpenses,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });



  app.get("/api/dashboard/recent-orders", tenantAuth, enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : null;
      const [orders, statuses] = await Promise.all([
        branchId ? storage.getOrdersByBranch(tenantId, branchId) : storage.getOrders(tenantId),
        storage.getOrderStatuses(tenantId),
      ]);
      const byId = new Map(statuses.map((s:any) => [s.id, String(s.name || "").toUpperCase()]));
      const pending = orders.filter((o:any) => ["PENDIENTE","PENDING"].includes(byId.get(o.statusId) || "")).slice(0, limit);
      const inProgress = orders.filter((o:any) => ["EN PROCESO","EN_PROCESO","IN_PROGRESS"].includes(byId.get(o.statusId) || "")).slice(0, limit);
      const recent = [...orders].sort((a:any,b:any)=>+new Date(b.createdAt)-+new Date(a.createdAt)).slice(0, limit);
      return res.json({ pending, inProgress, recent });
    } catch {
      return res.status(500).json({ error: "No se pudo cargar pedidos recientes", code: "DASHBOARD_RECENT_ORDERS_ERROR" });
    }
  });

  app.get("/api/dashboard/activity", tenantAuth, enforceBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const branchId = req.auth!.scope === "BRANCH" ? req.auth!.branchId! : null;
      const [orders, salesRows, cashRows] = await Promise.all([
        branchId ? storage.getOrdersByBranch(tenantId, branchId) : storage.getOrders(tenantId),
        storage.listSales(tenantId, { branchId, limit, offset: 0 }),
        storage.getCashMovements(tenantId),
      ]);
      const events = [
        ...orders.slice(0, limit).map((o:any) => ({ ts: o.updatedAt || o.createdAt, type: "ORDER", action: "updated", reference: `#${o.orderNumber || o.id}`, entityId: o.id })),
        ...salesRows.slice(0, limit).map((s:any) => ({ ts: s.saleDatetime || s.createdAt, type: "SALE", action: "created", reference: s.saleNumber || `#${s.id}`, entityId: s.id })),
        ...cashRows.slice(0, limit).map((c:any) => ({ ts: c.createdAt, type: "CASH", action: c.type, reference: c.description || c.category || `#${c.id}`, entityId: c.id })),
      ].sort((a,b)=>+new Date(b.ts)-+new Date(a.ts)).slice(0, limit);
      return res.json({ items: events });
    } catch {
      return res.status(500).json({ error: "No se pudo cargar actividad", code: "DASHBOARD_ACTIVITY_ERROR" });
    }
  });
  app.post(
    "/api/config/logo",
    tenantAuth,
    requireTenantAdmin,
    blockBranchScope,
    logoUploadLimiter,
    handleSingleUpload(profileUpload, "logo"),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: "No se subió archivo" });
        const logoUrl = `/uploads/profiles/${req.file.filename}`;
        const config = await storage.upsertConfig({
          tenantId: req.auth!.tenantId!,
          logoUrl,
        });
        const versionedUrl = `${logoUrl}?v=${new Date().getTime()}`;
        res.json({ data: { ...config, logoUrl: versionedUrl } });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
  });



  app.get("/api/tenant/export/:token", tenantAuth, async (req, res) => {
    try {
      const token = String(req.params.token || "");
      const { zipPath, zipName } = validateExportToken(token, req.auth!.tenantId!, req.auth!.userId);
      return res.download(zipPath, zipName);
    } catch (err: any) {
      if (err.message === "EXPORT_TOKEN_EXPIRED") return res.status(410).json({ error: "Export expirado", code: "EXPORT_TOKEN_EXPIRED" });
      if (err.message === "EXPORT_TOKEN_FORBIDDEN") return res.status(403).json({ error: "Export no autorizado", code: "EXPORT_FORBIDDEN" });
      return res.status(400).json({ error: "Token de export inválido", code: "EXPORT_TOKEN_INVALID" });
    }
  });

  app.delete("/api/tenant", tenantAuth, requireTenantAdmin, sensitiveActionLimiter, async (req, res) => {
    try {
      if (req.auth?.role === "CASHIER") {
        return res.status(403).json({ error: "Acceso denegado", code: "FORBIDDEN" });
      }
      const payload = deleteTenantSchema.parse(req.body || {});
      if (payload.confirm !== "ELIMINAR MI CUENTA") {
        return res.status(400).json({ error: "Confirmación inválida", code: "DELETE_CONFIRM_INVALID" });
      }
      const tenant = await storage.getTenantById(req.auth!.tenantId!);
      if (!tenant) return res.status(404).json({ error: "Tenant no encontrado", code: "TENANT_NOT_FOUND" });
      if ((tenant.code || "").toLowerCase() === (process.env.ROOT_TENANT_CODE || "t_root").toLowerCase()) {
        return res.status(403).json({ error: "No se puede eliminar tenant root", code: "ROOT_TENANT_DELETE_FORBIDDEN" });
      }

      const user = await storage.getUserById(req.auth!.userId, req.auth!.tenantId!);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
      const validPassword = await comparePassword(payload.password, user.password);
      if (!validPassword) return res.status(401).json({ error: "Password inválida", code: "PASSWORD_INVALID" });

      let exportToken: string | undefined;
      if (payload.exportBeforeDelete) {
        const exportData = await generateTenantExportZip(req.auth!.tenantId!, req.auth!.userId);
        exportToken = exportData.token;
      }

      const deletedCounts = await deleteTenantAtomic(req.auth!.tenantId!);
      return res.json({
        deleted: true,
        exportUrl: exportToken ? `/api/tenant/export/${exportToken}` : undefined,
        deletedCounts,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "VALIDATION_ERROR", details: err.errors });
      }
      if (String(err?.message || "").includes("EXPORT")) {
        return res.status(500).json({ error: "No se pudo generar exportación", code: "EXPORT_FAILED" });
      }
      return res.status(500).json({ error: "No se pudo eliminar cuenta", code: "TENANT_DELETE_ERROR" });
    }
  });

  app.get("/api/subscription/status", tenantAuth, async (req, res) => {
    try {
      const tenant = await storage.getTenantById(req.auth!.tenantId!);
      if (!tenant) return res.status(404).json({ error: "Tenant no encontrado" });
      let warning: string | null = null;
      let status: "active" | "warning" | "grace" | "blocked" = "active";
      if (tenant.subscriptionEndDate) {
        const now = new Date();
        const endDate = new Date(tenant.subscriptionEndDate);
        const graceDays = 3;
        const graceEnd = new Date(endDate);
        graceEnd.setDate(graceEnd.getDate() + graceDays);
        if (now > graceEnd) {
          status = "blocked";
          warning = "Cuenta bloqueada por falta de pago. Contacte al administrador.";
        } else if (now > endDate) {
          status = "grace";
          const msLeft = graceEnd.getTime() - now.getTime();
          const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
          const daysLeft = Math.floor(hoursLeft / 24);
          warning = daysLeft > 0
            ? `Tu suscripción venció. Tenés ${daysLeft} día(s) y ${hoursLeft % 24}h para renovar.`
            : `Tu suscripción venció. Tenés ${hoursLeft}h para renovar.`;
        } else {
          const msLeft = endDate.getTime() - now.getTime();
          const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
          if (daysLeft <= 7) {
            status = "warning";
            warning = `Tu suscripción vence en ${daysLeft} día(s). Renová a tiempo.`;
          }
        }
      }
      res.json({
        data: {
          subscriptionStartDate: tenant.subscriptionStartDate,
          subscriptionEndDate: tenant.subscriptionEndDate,
          isActive: tenant.isActive,
          status,
          warning,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  app.get("/api/subscription/transfer-info", tenantAuth, async (_req, res) => {
    try {
      const row = await storage.getSystemSetting("transfer_info");
      const data = row?.value ? JSON.parse(row.value) : null;
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/addons/status", tenantAuth, async (req, res) => {
    try {
      const addons = await storage.getTenantAddons(req.auth!.tenantId!);
      const result: Record<string, boolean> = {};
      for (const a of addons) {
        result[a.addonKey] = a.enabled;
      }
      res.json({ data: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
