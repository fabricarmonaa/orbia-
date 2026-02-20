import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { tenantAuth, requireTenantAdmin, blockBranchScope } from "../auth";
import { validateBody, validateParams } from "../middleware/validate";
import { sanitizeShortText } from "../security/sanitize";
import { db } from "../db";
import { statusDefinitions } from "@shared/schema";
import { ensureStatusExists, getDefaultStatus, getStatusUsageCount, getStatuses, mergeStatus, normalizeStatusCode, reorderStatuses } from "../services/statuses";

const entityTypeSchema = z.object({ entityType: z.enum(["ORDER", "PRODUCT", "DELIVERY"]) });
const idSchema = z.object({ entityType: z.enum(["ORDER", "PRODUCT", "DELIVERY"]), id: z.coerce.number().int().positive() });
const hexColorRegex = /^#(?:[0-9A-Fa-f]{3}){1,2}$/;

const createSchema = z.object({
  label: z.string().transform((v) => sanitizeShortText(v, 60)).refine((v) => v.length > 0, "Label requerido"),
  code: z.string().optional(),
  color: z.string().trim().max(20).optional().nullable(),
  isDefault: z.boolean().optional(),
  isFinal: z.boolean().optional(),
  isLocked: z.boolean().optional(),
});

const patchSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export function registerStatusRoutes(app: Express) {
  app.get("/api/statuses/:entityType", tenantAuth, requireTenantAdmin, blockBranchScope, validateParams(entityTypeSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "DELIVERY";
    const data = await getStatuses(tenantId, entityType, true);
    res.json({ data });
  });

  app.post("/api/statuses/:entityType", tenantAuth, requireTenantAdmin, blockBranchScope, validateParams(entityTypeSchema), validateBody(createSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "DELIVERY";
    const payload = req.body as z.infer<typeof createSchema>;
    const code = normalizeStatusCode(payload.code || payload.label);
    if (!/^[A-Z0-9_]{1,40}$/.test(code)) return res.status(400).json({ error: "Código inválido" });
    if (payload.color && !hexColorRegex.test(payload.color)) return res.status(400).json({ error: "Color inválido" });
    const current = await getStatuses(tenantId, entityType, true);
    if (payload.isDefault) {
      await db.update(statusDefinitions).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(statusDefinitions.tenantId, tenantId), eq(statusDefinitions.entityType, entityType)));
    }
    const [created] = await db.insert(statusDefinitions).values({
      tenantId,
      entityType,
      code,
      label: payload.label,
      color: payload.color || null,
      isFinal: payload.isFinal || false,
      isLocked: payload.isLocked || false,
      isDefault: payload.isDefault || current.length === 0,
      isActive: true,
      sortOrder: current.length + 1,
    }).returning();
    res.status(201).json({ data: created });
  });

  app.patch("/api/statuses/:entityType/:id", tenantAuth, requireTenantAdmin, blockBranchScope, validateParams(idSchema), validateBody(patchSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const payload = req.body as z.infer<typeof patchSchema>;
    const [current] = await db.select().from(statusDefinitions).where(and(eq(statusDefinitions.id, id), eq(statusDefinitions.tenantId, tenantId)));
    if (!current) return res.status(404).json({ error: "Estado no encontrado" });
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.label !== undefined) update.label = payload.label;
    if (payload.code !== undefined) update.code = normalizeStatusCode(payload.code);
    if (payload.color !== undefined) {
      if (payload.color && !hexColorRegex.test(payload.color)) return res.status(400).json({ error: "Color inválido" });
      update.color = payload.color;
    }
    if (payload.isFinal !== undefined) update.isFinal = payload.isFinal;
    if (payload.isLocked !== undefined) update.isLocked = payload.isLocked;
    if (payload.isActive !== undefined) update.isActive = payload.isActive;
    if (payload.isDefault) {
      await db.update(statusDefinitions).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(statusDefinitions.tenantId, tenantId), eq(statusDefinitions.entityType, current.entityType)));
      update.isDefault = true;
    }
    const [saved] = await db.update(statusDefinitions).set(update).where(eq(statusDefinitions.id, id)).returning();
    res.json({ data: saved });
  });

  app.post("/api/statuses/:entityType/reorder", tenantAuth, requireTenantAdmin, blockBranchScope, validateParams(entityTypeSchema), validateBody(z.object({ ids: z.array(z.number().int().positive()) })), async (req, res) => {
    await reorderStatuses(req.auth!.tenantId!, req.params.entityType as any, req.body.ids);
    res.json({ ok: true });
  });

  app.post("/api/statuses/:entityType/:id/set-default", tenantAuth, requireTenantAdmin, blockBranchScope, validateParams(idSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [row] = await db.select().from(statusDefinitions).where(and(eq(statusDefinitions.id, id), eq(statusDefinitions.tenantId, tenantId)));
    if (!row) return res.status(404).json({ error: "Estado no encontrado" });
    await db.update(statusDefinitions).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(statusDefinitions.tenantId, tenantId), eq(statusDefinitions.entityType, row.entityType)));
    await db.update(statusDefinitions).set({ isDefault: true, updatedAt: new Date() }).where(eq(statusDefinitions.id, id));
    const data = await getDefaultStatus(tenantId, row.entityType as any);
    res.json({ data });
  });

  app.post("/api/statuses/:entityType/:id/deactivate", tenantAuth, requireTenantAdmin, blockBranchScope, validateParams(idSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [row] = await db.select().from(statusDefinitions).where(and(eq(statusDefinitions.id, id), eq(statusDefinitions.tenantId, tenantId)));
    if (!row) return res.status(404).json({ error: "Estado no encontrado" });
    const inUse = await getStatusUsageCount(tenantId, row.entityType as any, row.code);
    if (inUse > 0) return res.status(409).json({ error: "Estado en uso", code: "STATUS_IN_USE", inUse });
    await db.update(statusDefinitions).set({ isActive: false, isDefault: false, updatedAt: new Date() }).where(eq(statusDefinitions.id, id));
    res.json({ ok: true });
  });

  app.post("/api/statuses/:entityType/:id/reactivate", tenantAuth, requireTenantAdmin, blockBranchScope, validateParams(idSchema), async (req, res) => {
    await db.update(statusDefinitions).set({ isActive: true, updatedAt: new Date() }).where(eq(statusDefinitions.id, Number(req.params.id)));
    res.json({ ok: true });
  });

  app.post("/api/statuses/:entityType/:id/merge-into", tenantAuth, requireTenantAdmin, blockBranchScope, validateParams(idSchema), validateBody(z.object({ targetId: z.number().int().positive() })), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [oldRow] = await db.select().from(statusDefinitions).where(and(eq(statusDefinitions.id, id), eq(statusDefinitions.tenantId, tenantId)));
    const [targetRow] = await db.select().from(statusDefinitions).where(and(eq(statusDefinitions.id, Number(req.body.targetId)), eq(statusDefinitions.tenantId, tenantId)));
    if (!oldRow || !targetRow || oldRow.entityType !== targetRow.entityType) return res.status(400).json({ error: "Merge inválido" });
    await ensureStatusExists(tenantId, oldRow.entityType as any, oldRow.code);
    await ensureStatusExists(tenantId, targetRow.entityType as any, targetRow.code);
    await mergeStatus(tenantId, oldRow.entityType as any, oldRow.code, targetRow.code);
    await db.update(statusDefinitions).set({ isActive: false, isDefault: false, updatedAt: new Date() }).where(eq(statusDefinitions.id, oldRow.id));
    res.json({ ok: true });
  });
}
