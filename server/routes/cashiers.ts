import type { Express } from "express";
import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { db } from "../db";
import { cashiers } from "@shared/schema";
import { comparePassword, generateToken, hashPassword, requirePlanFeature, requireTenantAdmin, tenantAuth } from "../auth";
import { storage } from "../storage";
import { validateBody, validateParams } from "../middleware/validate";
import { createRateLimiter } from "../middleware/rate-limit";
import { validateCashierPin } from "../services/password-policy";
import { sanitizeShortText } from "../security/sanitize";
import { getTenantLimitsSnapshot } from "../services/tenant-limits";
import { normalizePlanCode } from "@shared/plan-features";
import { logAuditEvent, logAuditEventFromRequest } from "../services/audit";

const pinSchema = z.string().regex(/^\d{4,8}$/);

const createCashierSchema = z.object({
  name: z.string().transform((value) => sanitizeShortText(value, 120)).refine((value) => value.length >= 2, "Nombre inválido"),
  pin: pinSchema,
  branch_id: z.coerce.number().int().positive().nullable().optional(),
});

const updateCashierSchema = z.object({
  name: z.string().transform((value) => sanitizeShortText(value, 120)).optional(),
  pin: pinSchema.optional(),
  active: z.boolean().optional(),
  branch_id: z.coerce.number().int().positive().nullable().optional(),
});

const cashierLoginSchema = z.object({
  tenant_code: z.preprocess((value) => typeof value === "string" ? sanitizeShortText(value, 40) : value, z.string().min(2).max(40)),
  pin: pinSchema,
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export function registerCashierRoutes(app: Express) {
  const cashierLoginLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 15,
    keyGenerator: (req) => `cashier-login:${req.ip}:${String(req.body?.tenant_code || "").toLowerCase()}`,
    errorMessage: "Demasiados intentos. Reintentá más tarde.",
    code: "RATE_LIMITED",
    onLimit: async ({ req, retryAfterSec }) => {
      const tenantCode = String(req.body?.tenant_code || "");
      const tenant = await storage.getTenantByCode(tenantCode).catch(() => undefined);
      if (!tenant) return;
      await storage.createAuditLog({
        tenantId: tenant.id,
        userId: null,
        action: "brute_force_blocked",
        entityType: "cashier_auth",
        metadata: { route: "/api/cashiers/login", ip: req.ip, retryAfterSec },
      }).catch(() => undefined);
    },
  });
  app.post("/api/cashiers/login", cashierLoginLimiter, validateBody(cashierLoginSchema), async (req, res) => {
    try {
      const { tenant_code, pin } = req.body as z.infer<typeof cashierLoginSchema>;
      const tenant = await storage.getTenantByCode(tenant_code);
      if (!tenant || !tenant.isActive || tenant.isBlocked || tenant.deletedAt) {
        return res.status(401).json({ error: "Credenciales inválidas", code: "CASHIER_AUTH_INVALID" });
      }
      const plan = await storage.getPlanById(tenant.planId || 0);
      const planCode = normalizePlanCode(plan?.planCode || "");
      if (!["PROFESIONAL", "ESCALA"].includes(planCode)) {
        return res.status(403).json({ error: "Tu plan no incluye cajeros", code: "FEATURE_BLOCKED" });
      }

      const cashiers = await storage.getActiveCashiers(tenant.id);
      let selected = null as any;
      for (const cashier of cashiers) {
        const ok = await comparePassword(pin, cashier.pinHash);
        if (ok) {
          selected = cashier;
          break;
        }
      }
      if (!selected) {
        return res.status(401).json({ error: "Credenciales inválidas", code: "CASHIER_AUTH_INVALID" });
      }
      if (!(selected as any).isApproved || (selected as any).revokedAt) {
        return res.status(403).json({ error: "Tu acceso de cajero está pendiente de aprobación", code: "CASHIER_PENDING_APPROVAL" });
      }

      const token = generateToken({
        userId: 0,
        email: `${selected.id}@cashier.local`,
        role: "CASHIER",
        tenantId: tenant.id,
        isSuperAdmin: false,
        branchId: selected.branchId || null,
        scope: selected.branchId ? "BRANCH" : "TENANT",
        cashierId: selected.id,
      });

      await logAuditEvent({ tenantId: tenant.id, branchId: selected.branchId || null, actorCashierId: selected.id, actorRole: "CASHIER", action: "cajero.login", entityType: "cashier", entityId: selected.id, metadata: { cashierName: selected.name } });
      return res.json({
        token,
        user: {
          id: selected.id,
          email: `${selected.id}@cashier.local`,
          fullName: selected.name,
          role: "CASHIER",
          tenantId: tenant.id,
          isSuperAdmin: false,
          branchId: selected.branchId || null,
          cashierId: selected.id,
        },
      });
    } catch {
      return res.status(500).json({ error: "No se pudo iniciar sesión", code: "CASHIER_AUTH_ERROR" });
    }
  });

  app.post("/api/cashiers", tenantAuth, requirePlanFeature("CASHIERS"), requireTenantAdmin, validateBody(createCashierSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const payload = req.body as z.infer<typeof createCashierSchema>;
      const pinCheck = validateCashierPin(payload.pin);
      if (!pinCheck.isValid) return res.status(400).json({ error: pinCheck.reason, code: "PIN_POLICY_FAILED" });
      if (payload.branch_id) {
        const branch = await storage.getBranchById(payload.branch_id, tenantId);
        if (!branch) return res.status(403).json({ error: "Sucursal inválida", code: "BRANCH_FORBIDDEN" });
      }
      const snapshot = await getTenantLimitsSnapshot(tenantId);
      if (!snapshot) return res.status(403).json({ error: "Plan inválido", code: "PLAN_INVALID" });

      const maxCashiers = snapshot.limits.maxCashiers;
      if (maxCashiers >= 0) {
        if (snapshot.usage.cashiersCount >= maxCashiers) {
          return res.status(409).json({
            code: "PLAN_LIMIT_REACHED",
            message: `Alcanzaste el límite de ${maxCashiers} cajero${maxCashiers === 1 ? "" : "s"} para tu plan ${snapshot.planName}.`,
            meta: {
              limit: maxCashiers,
              plan: snapshot.planCode,
              resource: "cashiers",
            },
          });
        }
      }

      if (payload.branch_id) {
        const [row] = await db.select({ c: count() }).from(cashiers).where(and(eq(cashiers.tenantId, tenantId), eq(cashiers.branchId, payload.branch_id), eq(cashiers.active, true)));
        if (Number(row?.c || 0) >= 1) {
          return res.status(400).json({ error: "Solo una caja permitida por sucursal", code: "BRANCH_LIMIT_REACHED", limit: "max_cashiers_per_branch" });
        }
      }
      const pinHash = await hashPassword(payload.pin);
      const data = await storage.createCashier({
        tenantId,
        branchId: payload.branch_id ?? null,
        name: payload.name,
        pinHash,
        active: true,
        isApproved: false,
      });
      logAuditEventFromRequest(req, { action: "cajero.crear", entityType: "cashier", entityId: data.id, metadata: { branchId: payload.branch_id, name: payload.name, estado: "pendiente_aprobacion" } });
      res.status(201).json({ data: { id: data.id, name: data.name, branch_id: data.branchId, active: data.active, is_approved: (data as any).isApproved ?? false } });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "No se pudo crear cajero", code: "CASHIER_CREATE_ERROR" });
    }
  });

  app.get("/api/cashiers", tenantAuth, requirePlanFeature("CASHIERS"), requireTenantAdmin, async (req, res) => {
    try {
      const data = await storage.getCashiers(req.auth!.tenantId!);
      res.json({ data: data.map((x) => ({ id: x.id, name: x.name, branch_id: x.branchId, active: x.active, is_approved: (x as any).isApproved ?? false, approved_at: (x as any).approvedAt ?? null, revoked_at: (x as any).revokedAt ?? null })) });
    } catch {
      res.status(500).json({ error: "No se pudo listar cajeros", code: "CASHIER_LIST_ERROR" });
    }
  });


  app.post("/api/cashiers/:id/approve", tenantAuth, requirePlanFeature("CASHIERS"), requireTenantAdmin, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const [updated] = await db.update(cashiers).set({ isApproved: true, approvedAt: new Date(), approvedByUserId: req.auth!.userId!, revokedAt: null }).where(and(eq(cashiers.id, id), eq(cashiers.tenantId, tenantId))).returning();
      if (!updated) return res.status(404).json({ error: "Cajero no encontrado", code: "CASHIER_NOT_FOUND" });
      logAuditEventFromRequest(req, { action: "cajero.aprobar", entityType: "cashier", entityId: id, metadata: { isApproved: true } });
      return res.json({ data: { id: updated.id, is_approved: updated.isApproved, approved_at: updated.approvedAt } });
    } catch {
      return res.status(500).json({ error: "No se pudo aprobar el cajero", code: "CASHIER_APPROVE_ERROR" });
    }
  });

  app.post("/api/cashiers/:id/revoke", tenantAuth, requirePlanFeature("CASHIERS"), requireTenantAdmin, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const [updated] = await db.update(cashiers).set({ isApproved: false, revokedAt: new Date(), active: false }).where(and(eq(cashiers.id, id), eq(cashiers.tenantId, tenantId))).returning();
      if (!updated) return res.status(404).json({ error: "Cajero no encontrado", code: "CASHIER_NOT_FOUND" });
      logAuditEventFromRequest(req, { action: "cajero.revocar", entityType: "cashier", entityId: id, metadata: { isApproved: false } });
      return res.json({ data: { id: updated.id, is_approved: updated.isApproved, revoked_at: updated.revokedAt } });
    } catch {
      return res.status(500).json({ error: "No se pudo revocar el cajero", code: "CASHIER_REVOKE_ERROR" });
    }
  });

  app.patch("/api/cashiers/:id", tenantAuth, requirePlanFeature("CASHIERS"), requireTenantAdmin, validateParams(idParamSchema), validateBody(updateCashierSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = req.params.id as unknown as number;
      const payload = req.body as z.infer<typeof updateCashierSchema>;
      if (payload.branch_id) {
        const branch = await storage.getBranchById(payload.branch_id, tenantId);
        if (!branch) return res.status(403).json({ error: "Sucursal inválida", code: "BRANCH_FORBIDDEN" });
      }
      if (payload.branch_id) {
        // Excluimos la caja actual de la cuenta
        // Si hay una caja y NO es la caja que estamos editando
        const existing = await db.select().from(cashiers).where(
          and(
            eq(cashiers.tenantId, tenantId),
            eq(cashiers.branchId, payload.branch_id),
            eq(cashiers.active, true)
          )
        ).limit(1);

        if (existing.length > 0 && existing[0].id !== id) {
          return res.status(400).json({ error: "Solo una caja permitida por sucursal", code: "BRANCH_LIMIT_REACHED", limit: "max_cashiers_per_branch" });
        }
      }
      if (payload.pin) {
        const pinCheck = validateCashierPin(payload.pin);
        if (!pinCheck.isValid) return res.status(400).json({ error: pinCheck.reason, code: "PIN_POLICY_FAILED" });
      }
      const data = await storage.updateCashier(id, tenantId, {
        name: payload.name,
        branchId: payload.branch_id,
        active: payload.active,
        pinHash: payload.pin ? await hashPassword(payload.pin) : undefined,
      });
      if (!data) return res.status(404).json({ error: "Cajero no encontrado", code: "CASHIER_NOT_FOUND" });
      logAuditEventFromRequest(req, { action: "cajero.actualizar", entityType: "cashier", entityId: data.id, metadata: { branchId: payload.branch_id, active: payload.active, updatedFields: Object.keys(payload) } });
      res.json({ data: { id: data.id, name: data.name, branch_id: data.branchId, active: data.active } });
    } catch {
      res.status(500).json({ error: "No se pudo actualizar cajero", code: "CASHIER_UPDATE_ERROR" });
    }
  });

  app.delete("/api/cashiers/:id", tenantAuth, requirePlanFeature("CASHIERS"), requireTenantAdmin, validateParams(idParamSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = req.params.id as unknown as number;
      const data = await storage.deactivateCashier(id, tenantId);
      if (!data) return res.status(404).json({ error: "Cajero no encontrado", code: "CASHIER_NOT_FOUND" });
      logAuditEventFromRequest(req, { action: "cajero.desactivar", entityType: "cashier", entityId: id, metadata: { active: false } });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "No se pudo eliminar cajero", code: "CASHIER_DELETE_ERROR" });
    }
  });
}
