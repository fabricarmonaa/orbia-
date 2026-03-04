import type { Express } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { optionListItems, optionLists, orderFieldDefinitions, productFieldDefinitions, saleFieldDefinitions } from "@shared/schema";
import { requirePermission, tenantAuth } from "../auth";
import { validateBody, validateParams } from "../middleware/validate";
import { sanitizeShortText } from "../security/sanitize";
import { logAuditEventFromRequest } from "../services/audit";
import { normalizeOptionListKey } from "@shared/validators/fields";

const listSchema = z.object({
  key: z.string().min(2).max(80).transform((value) => normalizeOptionListKey(sanitizeShortText(value, 80))),
  name: z.string().min(2).max(120).transform((value) => sanitizeShortText(value, 120)),
  entityScope: z.string().max(30).optional().nullable(),
});

const listPatchSchema = listSchema.partial();
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const keyParamSchema = z.object({ key: z.string().min(2).max(80) });
const itemIdParamSchema = z.object({ key: z.string().min(2).max(80), itemId: z.coerce.number().int().positive() });
const itemSchema = z.object({
  value: z.string().min(1).max(120).transform((value) => sanitizeShortText(value, 120)),
  label: z.string().min(1).max(120).transform((value) => sanitizeShortText(value, 120)),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
const itemPatchSchema = itemSchema.partial();

async function findListByKey(tenantId: number, key: string) {
  const normalizedKey = normalizeOptionListKey(key);
  const [list] = await db.select().from(optionLists).where(and(eq(optionLists.tenantId, tenantId), eq(optionLists.key, normalizedKey)));
  return list ?? null;
}

export function registerOptionListsRoutes(app: Express) {
  app.get("/api/option-lists", tenantAuth, requirePermission("SETTINGS_EDIT"), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const lists = await db.select().from(optionLists).where(eq(optionLists.tenantId, tenantId)).orderBy(asc(optionLists.name));
    const ids = lists.map((list) => list.id);
    const items = ids.length
      ? await db.select().from(optionListItems).where(and(inArray(optionListItems.listId, ids), eq(optionListItems.tenantId, tenantId))).orderBy(asc(optionListItems.sortOrder), asc(optionListItems.label))
      : [];

    const byListId = new Map<number, typeof items>();
    for (const item of items) {
      const row = byListId.get(item.listId) || [];
      row.push(item);
      byListId.set(item.listId, row);
    }
    res.json({ data: lists.map((list) => ({ ...list, items: byListId.get(list.id) || [] })) });
  });

  app.post("/api/option-lists", tenantAuth, requirePermission("SETTINGS_EDIT"), validateBody(listSchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const payload = req.body as z.infer<typeof listSchema>;
      const [created] = await db.insert(optionLists).values({ tenantId, key: payload.key, name: payload.name, entityScope: payload.entityScope || null }).returning();
      logAuditEventFromRequest(req, { action: "OPTION_LIST_CREATED", entityType: "option_list", entityId: created.id, metadata: { key: created.key } });
      res.status(201).json({ data: created });
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("uq_option_lists_tenant_key")) {
        return res.status(409).json({ code: "OPTION_LIST_KEY_CONFLICT", message: "Ya existe una lista con esa clave." });
      }
      return res.status(500).json({ code: "OPTION_LIST_CREATE_ERROR", message: "No se pudo crear la lista." });
    }
  });

  app.patch("/api/option-lists/:id", tenantAuth, requirePermission("SETTINGS_EDIT"), validateParams(idParamSchema), validateBody(listPatchSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const payload = req.body as z.infer<typeof listPatchSchema>;
    const [updated] = await db
      .update(optionLists)
      .set({ key: payload.key, name: payload.name, entityScope: payload.entityScope })
      .where(and(eq(optionLists.id, id), eq(optionLists.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ code: "OPTION_LIST_NOT_FOUND", message: "Lista no encontrada." });
    logAuditEventFromRequest(req, { action: "OPTION_LIST_UPDATED", entityType: "option_list", entityId: updated.id, metadata: { key: updated.key } });
    res.json({ data: updated });
  });

  app.delete("/api/option-lists/:id", tenantAuth, requirePermission("SETTINGS_EDIT"), validateParams(idParamSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const id = Number(req.params.id);
    const [list] = await db.select().from(optionLists).where(and(eq(optionLists.id, id), eq(optionLists.tenantId, tenantId)));
    if (!list) return res.status(404).json({ code: "OPTION_LIST_NOT_FOUND", message: "Lista no encontrada." });

    const [orderUse] = await db.select({ total: sql<number>`count(*)` }).from(orderFieldDefinitions).where(and(eq(orderFieldDefinitions.tenantId, tenantId), sql`${orderFieldDefinitions.config} ->> 'optionListKey' = ${list.key}`));
    const [productUse] = await db.select({ total: sql<number>`count(*)` }).from(productFieldDefinitions).where(and(eq(productFieldDefinitions.tenantId, tenantId), sql`${productFieldDefinitions.config} ->> 'optionListKey' = ${list.key}`));
    const [saleUse] = await db.select({ total: sql<number>`count(*)` }).from(saleFieldDefinitions).where(and(eq(saleFieldDefinitions.tenantId, tenantId), sql`${saleFieldDefinitions.config} ->> 'optionListKey' = ${list.key}`));
    const totalUsage = Number(orderUse?.total || 0) + Number(productUse?.total || 0) + Number(saleUse?.total || 0);
    if (totalUsage > 0) {
      return res.status(409).json({ code: "OPTION_LIST_IN_USE", message: "No podés eliminar esta lista porque está en uso por campos dinámicos.", meta: { usageCount: totalUsage } });
    }

    await db.delete(optionListItems).where(and(eq(optionListItems.tenantId, tenantId), eq(optionListItems.listId, id)));
    const [deleted] = await db.delete(optionLists).where(and(eq(optionLists.id, id), eq(optionLists.tenantId, tenantId))).returning();
    logAuditEventFromRequest(req, { action: "OPTION_LIST_DELETED", entityType: "option_list", entityId: id, metadata: { key: deleted?.key || list.key } });
    return res.json({ ok: true });
  });

  app.get("/api/option-lists/:key/items", tenantAuth, requirePermission("SETTINGS_EDIT"), validateParams(keyParamSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const list = await findListByKey(tenantId, String(req.params.key));
    if (!list) return res.status(404).json({ code: "OPTION_LIST_NOT_FOUND", message: "Lista no encontrada." });
    const items = await db.select().from(optionListItems).where(and(eq(optionListItems.tenantId, tenantId), eq(optionListItems.listId, list.id))).orderBy(asc(optionListItems.sortOrder), asc(optionListItems.label));
    return res.json({ data: items });
  });

  app.post("/api/option-lists/:key/items", tenantAuth, requirePermission("SETTINGS_EDIT"), validateParams(keyParamSchema), validateBody(itemSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const list = await findListByKey(tenantId, String(req.params.key));
    if (!list) return res.status(404).json({ code: "OPTION_LIST_NOT_FOUND", message: "Lista no encontrada." });
    const payload = req.body as z.infer<typeof itemSchema>;
    const [item] = await db.insert(optionListItems).values({ tenantId, listId: list.id, value: payload.value, label: payload.label, sortOrder: payload.sortOrder ?? 0, isActive: payload.isActive ?? true }).returning();
    logAuditEventFromRequest(req, { action: "OPTION_LIST_ITEM_CREATED", entityType: "option_list", entityId: list.id, metadata: { key: list.key, value: item.value } });
    res.status(201).json({ data: item });
  });

  app.patch("/api/option-lists/:key/items/:itemId", tenantAuth, requirePermission("SETTINGS_EDIT"), validateParams(itemIdParamSchema), validateBody(itemPatchSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const list = await findListByKey(tenantId, String(req.params.key));
    if (!list) return res.status(404).json({ code: "OPTION_LIST_NOT_FOUND", message: "Lista no encontrada." });
    const payload = req.body as z.infer<typeof itemPatchSchema>;
    const [item] = await db.update(optionListItems).set({ value: payload.value, label: payload.label, sortOrder: payload.sortOrder, isActive: payload.isActive }).where(and(eq(optionListItems.id, Number(req.params.itemId)), eq(optionListItems.listId, list.id), eq(optionListItems.tenantId, tenantId))).returning();
    if (!item) return res.status(404).json({ code: "OPTION_LIST_ITEM_NOT_FOUND", message: "Ítem no encontrado." });
    logAuditEventFromRequest(req, { action: "OPTION_LIST_ITEM_UPDATED", entityType: "option_list", entityId: list.id, metadata: { key: list.key, itemId: item.id } });
    return res.json({ data: item });
  });

  app.delete("/api/option-lists/:key/items/:itemId", tenantAuth, requirePermission("SETTINGS_EDIT"), validateParams(itemIdParamSchema), async (req, res) => {
    const tenantId = req.auth!.tenantId!;
    const list = await findListByKey(tenantId, String(req.params.key));
    if (!list) return res.status(404).json({ code: "OPTION_LIST_NOT_FOUND", message: "Lista no encontrada." });
    const [item] = await db.delete(optionListItems).where(and(eq(optionListItems.id, Number(req.params.itemId)), eq(optionListItems.listId, list.id), eq(optionListItems.tenantId, tenantId))).returning();
    if (!item) return res.status(404).json({ code: "OPTION_LIST_ITEM_NOT_FOUND", message: "Ítem no encontrado." });
    logAuditEventFromRequest(req, { action: "OPTION_LIST_ITEM_DELETED", entityType: "option_list", entityId: list.id, metadata: { key: list.key, itemId: item.id } });
    return res.json({ ok: true });
  });
}
