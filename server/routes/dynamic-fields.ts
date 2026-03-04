import type { Express } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { tenantAuth, requireTenantAdmin } from "../auth";
import { db } from "../db";
import {
  orderTypeDefinitions,
  orderTypePresets,
  orderFieldDefinitions,
  productFieldDefinitions,
  productFieldValues,
  products,
  saleFieldDefinitions,
  saleFieldValues,
  optionLists,
  entityVisibilitySettings,
  sales,
  cashMovements,
} from "@shared/schema";
import { validateBody, validateParams } from "../middleware/validate";
import { orderPresetsStorage } from "../storage/order-presets";
import { sanitizeShortText } from "../security/sanitize";
import { logAuditEventFromRequest } from "../services/audit";
import { FieldType, normalizeFieldKey, validateFieldDefinitionConfig } from "@shared/validators/fields";
import { normalizeTypedFieldValue } from "../services/field-values";
import { buildReorderSortOrder } from "../services/field-utils";

const entityTypeSchema = z.object({ entityType: z.enum(["ORDER", "PRODUCT", "SALE"]) });
const createFieldSchema = z.object({
  orderTypeCode: z.string().max(40).optional(),
  presetId: z.coerce.number().int().positive().optional(),
  fieldKey: z.string().min(1).max(80).optional(),
  label: z.string().min(1).max(160),
  fieldType: z.enum(["TEXT", "NUMBER", "MONEY", "BOOLEAN", "DATE", "SELECT", "MULTISELECT", "TEXTAREA", "FILE"]),
  required: z.boolean().optional(),
  showInTracking: z.boolean().optional(),
  config: z.record(z.any()).optional(),
  visibleInTicket: z.boolean().optional(),
});
const patchFieldSchema = createFieldSchema.partial();
const fieldIdSchema = z.object({ entityType: z.enum(["ORDER", "PRODUCT", "SALE"]), id: z.coerce.number().int().positive() });
const reorderSchema = z.object({ orderedFieldIds: z.array(z.coerce.number().int().positive()).min(1), presetId: z.coerce.number().int().positive().optional() });
const productIdSchema = z.object({ id: z.coerce.number().int().positive() });
const saleIdSchema = z.object({ id: z.coerce.number().int().positive() });

const visibilitySchema = z.object({
  settings: z.record(z.any()).default({}),
});

const valueSchema = z.object({
  fieldDefinitionId: z.coerce.number().int().positive(),
  valueText: z.string().optional().nullable(),
  valueNumber: z.union([z.string(), z.number()]).optional().nullable(),
  valueBool: z.boolean().optional().nullable(),
  valueDate: z.string().optional().nullable(),
  valueJson: z.any().optional().nullable(),
  valueMoneyAmount: z.union([z.string(), z.number()]).optional().nullable(),
  valueMoneyDirection: z.coerce.number().int().optional().nullable(),
  currency: z.string().max(3).optional().nullable(),
  fileStorageKey: z.string().optional().nullable(),
});

async function configResolver(tenantId: number) {
  return {
    hasOptionListKey: async (key: string) => {
      const [list] = await db.select({ id: optionLists.id }).from(optionLists).where(and(eq(optionLists.tenantId, tenantId), eq(optionLists.key, key)));
      return Boolean(list?.id);
    },
  };
}

async function listFieldsByEntity(tenantId: number, entityType: "ORDER" | "PRODUCT" | "SALE") {
  if (entityType === "ORDER") {
    return db.select().from(orderFieldDefinitions).where(eq(orderFieldDefinitions.tenantId, tenantId)).orderBy(asc(orderFieldDefinitions.sortOrder), asc(orderFieldDefinitions.id));
  }
  if (entityType === "PRODUCT") {
    return db.select().from(productFieldDefinitions).where(eq(productFieldDefinitions.tenantId, tenantId)).orderBy(asc(productFieldDefinitions.sortOrder), asc(productFieldDefinitions.id));
  }
  return db.select().from(saleFieldDefinitions).where(eq(saleFieldDefinitions.tenantId, tenantId)).orderBy(asc(saleFieldDefinitions.sortOrder), asc(saleFieldDefinitions.id));
}

export function registerDynamicFieldsRoutes(app: Express) {
  app.get("/api/presets/orders", tenantAuth, requireTenantAdmin, async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const types = await db.select().from(orderTypeDefinitions).where(eq(orderTypeDefinitions.tenantId, tenantId));
    const typeIds = types.map((t) => t.id);
    const presets = typeIds.length ? await db.select().from(orderTypePresets).where(and(eq(orderTypePresets.tenantId, tenantId), inArray(orderTypePresets.orderTypeId, typeIds))).orderBy(asc(orderTypePresets.orderTypeId), asc(orderTypePresets.sortOrder)) : [];
    return res.json({ data: presets });
  });

  app.post("/api/presets/orders/:id/set-default", tenantAuth, requireTenantAdmin, validateParams(productIdSchema), async (req, res) => {
    const saved = await orderPresetsStorage.setDefaultPreset(req.auth!.tenantId!, Number(req.params.id));
    logAuditEventFromRequest(req, { action: "PRESET_UPDATED", entityType: "order_preset", entityId: saved.id, metadata: { orderTypeId: saved.orderTypeId } });
    return res.json({ data: saved });
  });

  app.get("/api/fields/:entityType", tenantAuth, requireTenantAdmin, validateParams(entityTypeSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "SALE";
    const data = await listFieldsByEntity(tenantId, entityType);
    return res.json({ data });
  });

  app.post("/api/fields/:entityType", tenantAuth, requireTenantAdmin, validateParams(entityTypeSchema), validateBody(createFieldSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "SALE";
    const payload = req.body as z.infer<typeof createFieldSchema>;
    const cfg = await validateFieldDefinitionConfig({ fieldType: payload.fieldType as FieldType, config: payload.config }, await configResolver(tenantId));

    if (entityType === "ORDER") {
      if (!payload.presetId) return res.status(400).json({ code: "FIELD_PRESET_REQUIRED", message: "presetId es requerido para ORDER." });
      const result = await orderPresetsStorage.createField(tenantId, payload.presetId, {
        label: sanitizeShortText(payload.label, 160),
        fieldType: payload.fieldType,
        required: payload.required,
        fieldKey: payload.fieldKey,
        config: cfg,
        visibleInTracking: payload.showInTracking,
      });
      logAuditEventFromRequest(req, { action: "FIELD_CREATED", entityType: "order_field", entityId: result.field.id, metadata: { presetId: payload.presetId } });
      return res.status(201).json({ data: result.field });
    }

    const current = await listFieldsByEntity(tenantId, entityType);
    const base = {
      tenantId,
      fieldKey: payload.fieldKey ? normalizeFieldKey(payload.fieldKey) : normalizeFieldKey(payload.label),
      label: sanitizeShortText(payload.label, 160),
      fieldType: payload.fieldType,
      required: Boolean(payload.required),
      sortOrder: (current.at(-1)?.sortOrder || 0) + 1,
      config: cfg || {},
      isActive: true,
    };

    if (entityType === "PRODUCT") {
      const [created] = await db.insert(productFieldDefinitions).values(base).returning();
      logAuditEventFromRequest(req, { action: "FIELD_CREATED", entityType: "product_field", entityId: created.id });
      return res.status(201).json({ data: created });
    }

    const [created] = await db.insert(saleFieldDefinitions).values({ ...base, visibleInTicket: payload.visibleInTicket ?? true }).returning();
    logAuditEventFromRequest(req, { action: "FIELD_CREATED", entityType: "sale_field", entityId: created.id });
    return res.status(201).json({ data: created });
  });

  app.patch("/api/fields/:entityType/:id", tenantAuth, requireTenantAdmin, validateParams(fieldIdSchema), validateBody(patchFieldSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "SALE";
    const payload = req.body as z.infer<typeof patchFieldSchema>;
    const cfg = payload.config !== undefined ? await validateFieldDefinitionConfig({ fieldType: (payload.fieldType as FieldType) || "TEXT", config: payload.config }, await configResolver(tenantId)) : undefined;

    if (entityType === "ORDER") {
      const saved = await orderPresetsStorage.updateField(tenantId, id, { label: payload.label, required: payload.required, config: cfg, visibleInTracking: payload.showInTracking });
      logAuditEventFromRequest(req, { action: "FIELD_UPDATED", entityType: "order_field", entityId: id });
      return res.json({ data: saved });
    }

    const table = entityType === "PRODUCT" ? productFieldDefinitions : saleFieldDefinitions;
    const [saved] = await db.update(table).set({ label: payload.label ? sanitizeShortText(payload.label, 160) : undefined, required: payload.required, config: cfg, isActive: payload.required === undefined ? undefined : true }).where(and(eq(table.id, id), eq(table.tenantId, tenantId))).returning();
    if (!saved) return res.status(404).json({ code: "FIELD_NOT_FOUND", message: "Campo no encontrado." });
    logAuditEventFromRequest(req, { action: "FIELD_UPDATED", entityType: entityType === "PRODUCT" ? "product_field" : "sale_field", entityId: id });
    return res.json({ data: saved });
  });

  app.post("/api/fields/:entityType/reorder", tenantAuth, requireTenantAdmin, validateParams(entityTypeSchema), validateBody(reorderSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "SALE";
    const payload = req.body as z.infer<typeof reorderSchema>;

    if (entityType === "ORDER") {
      if (!payload.presetId) return res.status(400).json({ code: "FIELD_PRESET_REQUIRED", message: "presetId es requerido para ORDER." });
      const data = await orderPresetsStorage.reorderFields(tenantId, payload.presetId, payload.orderedFieldIds);
      logAuditEventFromRequest(req, { action: "FIELD_REORDERED", entityType: "order_field", metadata: { presetId: payload.presetId, count: payload.orderedFieldIds.length } });
      return res.json({ data: data.fields });
    }

    const table = entityType === "PRODUCT" ? productFieldDefinitions : saleFieldDefinitions;
    await db.transaction(async (tx) => {
      const nextOrder = buildReorderSortOrder(payload.orderedFieldIds);
      for (const item of nextOrder) {
        await tx.update(table).set({ sortOrder: item.sortOrder }).where(and(eq(table.id, item.fieldId), eq(table.tenantId, tenantId)));
      }
    });
    const data = await listFieldsByEntity(tenantId, entityType);
    logAuditEventFromRequest(req, { action: "FIELD_REORDERED", entityType: entityType === "PRODUCT" ? "product_field" : "sale_field", metadata: { count: payload.orderedFieldIds.length } });
    return res.json({ data });
  });

  app.post("/api/fields/:entityType/:id/deactivate", tenantAuth, requireTenantAdmin, validateParams(fieldIdSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "SALE";
    if (entityType === "ORDER") {
      const saved = await orderPresetsStorage.deactivateField(tenantId, id);
      logAuditEventFromRequest(req, { action: "FIELD_DEACTIVATED", entityType: "order_field", entityId: id });
      return res.json({ data: saved });
    }
    const table = entityType === "PRODUCT" ? productFieldDefinitions : saleFieldDefinitions;
    const [saved] = await db.update(table).set({ isActive: false }).where(and(eq(table.id, id), eq(table.tenantId, tenantId))).returning();
    if (!saved) return res.status(404).json({ code: "FIELD_NOT_FOUND", message: "Campo no encontrado." });
    logAuditEventFromRequest(req, { action: "FIELD_DEACTIVATED", entityType: entityType === "PRODUCT" ? "product_field" : "sale_field", entityId: id });
    return res.json({ data: saved });
  });

  app.post("/api/fields/:entityType/:id/reactivate", tenantAuth, requireTenantAdmin, validateParams(fieldIdSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "SALE";
    const table = entityType === "PRODUCT" ? productFieldDefinitions : entityType === "SALE" ? saleFieldDefinitions : orderFieldDefinitions;
    const [saved] = await db.update(table).set({ isActive: true }).where(and(eq(table.id, id), eq(table.tenantId, tenantId))).returning();
    if (!saved) return res.status(404).json({ code: "FIELD_NOT_FOUND", message: "Campo no encontrado." });
    logAuditEventFromRequest(req, { action: "FIELD_REACTIVATED", entityType: `${entityType.toLowerCase()}_field`, entityId: id });
    return res.json({ data: saved });
  });


  app.get("/api/visibility/:entityType", tenantAuth, requireTenantAdmin, validateParams(entityTypeSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "SALE";
    const [row] = await db.select().from(entityVisibilitySettings).where(and(eq(entityVisibilitySettings.tenantId, tenantId), eq(entityVisibilitySettings.entityType, entityType)));
    return res.json({ data: row?.settings || {} });
  });

  app.put("/api/visibility/:entityType", tenantAuth, requireTenantAdmin, validateParams(entityTypeSchema), validateBody(visibilitySchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const entityType = req.params.entityType as "ORDER" | "PRODUCT" | "SALE";
    const settings = (req.body as z.infer<typeof visibilitySchema>).settings || {};
    const [existing] = await db.select({ id: entityVisibilitySettings.id }).from(entityVisibilitySettings).where(and(eq(entityVisibilitySettings.tenantId, tenantId), eq(entityVisibilitySettings.entityType, entityType)));
    const [saved] = existing
      ? await db.update(entityVisibilitySettings).set({ settings }).where(eq(entityVisibilitySettings.id, existing.id)).returning()
      : await db.insert(entityVisibilitySettings).values({ tenantId, entityType, settings }).returning();
    logAuditEventFromRequest(req, { action: "VISIBILITY_SETTINGS_UPDATED", entityType: "visibility_settings", entityId: saved.id, metadata: { entityType } });
    return res.json({ data: saved.settings });
  });

  app.get("/api/products/:id/custom-fields", tenantAuth, requireTenantAdmin, validateParams(productIdSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const productId = Number(req.params.id);
    const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));
    if (!product) return res.status(404).json({ code: "PRODUCT_NOT_FOUND", message: "Producto no encontrado." });
    const defs = await db.select().from(productFieldDefinitions).where(and(eq(productFieldDefinitions.tenantId, tenantId), eq(productFieldDefinitions.isActive, true))).orderBy(asc(productFieldDefinitions.sortOrder), asc(productFieldDefinitions.id));
    const vals = await db.select().from(productFieldValues).where(and(eq(productFieldValues.tenantId, tenantId), eq(productFieldValues.productId, productId)));
    const map = new Map(vals.map((v) => [v.fieldDefinitionId, v]));
    return res.json({ data: defs.map((d) => ({ ...d, value: map.get(d.id) || null })) });
  });

  app.put("/api/products/:id/custom-fields", tenantAuth, requireTenantAdmin, validateParams(productIdSchema), validateBody(z.object({ values: z.array(valueSchema).default([]) })), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const productId = Number(req.params.id);
    const payload = req.body as { values: z.infer<typeof valueSchema>[] };
    const defs = await db.select({ id: productFieldDefinitions.id, fieldKey: productFieldDefinitions.fieldKey }).from(productFieldDefinitions).where(eq(productFieldDefinitions.tenantId, tenantId));
    const defById = new Map(defs.map((d) => [d.id, d]));
    for (const row of payload.values || []) {
      const [existing] = await db.select().from(productFieldValues).where(and(eq(productFieldValues.tenantId, tenantId), eq(productFieldValues.productId, productId), eq(productFieldValues.fieldDefinitionId, row.fieldDefinitionId)));
      const data = normalizeTypedFieldValue(row);
      const fieldKey = defById.get(row.fieldDefinitionId)?.fieldKey || null;
      if (existing) await db.update(productFieldValues).set({ ...data, fieldKey }).where(eq(productFieldValues.id, existing.id));
      else await db.insert(productFieldValues).values({ tenantId, productId, fieldDefinitionId: row.fieldDefinitionId, fieldKey, ...data });
    }
    logAuditEventFromRequest(req, { action: "FIELD_VALUES_UPDATED", entityType: "product", entityId: productId, metadata: { values: payload.values?.length || 0 } });
    return res.json({ ok: true });
  });

  app.put("/api/sales/:id/custom-fields", tenantAuth, requireTenantAdmin, validateParams(saleIdSchema), validateBody(z.object({ values: z.array(valueSchema).default([]) })), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const saleId = Number(req.params.id);
    const payload = req.body as { values: z.infer<typeof valueSchema>[] };

    const defs = await db.select().from(saleFieldDefinitions).where(eq(saleFieldDefinitions.tenantId, tenantId));
    const defById = new Map(defs.map((d) => [d.id, d]));

    for (const row of payload.values || []) {
      const [existing] = await db.select().from(saleFieldValues).where(and(eq(saleFieldValues.tenantId, tenantId), eq(saleFieldValues.saleId, saleId), eq(saleFieldValues.fieldDefinitionId, row.fieldDefinitionId)));
      const data = normalizeTypedFieldValue(row);
      const def = defById.get(row.fieldDefinitionId);
      const fieldKey = def?.fieldKey || null;
      if (existing) await db.update(saleFieldValues).set({ ...data, fieldKey }).where(eq(saleFieldValues.id, existing.id));
      else await db.insert(saleFieldValues).values({ tenantId, saleId, fieldDefinitionId: row.fieldDefinitionId, fieldKey, ...data });

      if (def?.fieldType === "MONEY") {
        const amount = Number(data.valueMoneyAmount || 0);
        if (Number.isFinite(amount) && amount > 0) {
          const directionCfg = String((def.config as any)?.direction || "").toUpperCase();
          const direction = data.valueMoneyDirection != null ? (Number(data.valueMoneyDirection) >= 0 ? "IN" : "OUT") : (directionCfg === "OUT" ? "OUT" : "IN");
          const reference = `sale:${saleId}:field:${def.fieldKey}`;
          const [existsMovement] = await db.select({ id: cashMovements.id }).from(cashMovements).where(and(eq(cashMovements.tenantId, tenantId), eq(cashMovements.saleId, saleId), eq(cashMovements.category, "field_money"), sql`${cashMovements.description} = ${reference}`));
          if (!existsMovement) {
            const [sale] = await db.select({ branchId: sales.branchId }).from(sales).where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId)));
            const [movement] = await db.insert(cashMovements).values({
              tenantId,
              branchId: sale?.branchId || null,
              saleId,
              type: direction === "OUT" ? "expense" : "income",
              amount: String(amount),
              method: "efectivo",
              category: "field_money",
              description: reference,
              createdById: req.auth!.userId,
            }).returning();
            logAuditEventFromRequest(req, { action: "SALE_FIELD_MONEY_CASH_IMPACT", entityType: "cash_movement", entityId: movement.id, metadata: { saleId, fieldKey: def.fieldKey, direction, amount } });
          }
        }
      }
    }

    logAuditEventFromRequest(req, { action: "FIELD_VALUES_UPDATED", entityType: "sale", entityId: saleId, metadata: { values: payload.values.length } });
    return res.json({ ok: true });
  });
}
