import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  tenantAuth,
  requireFeature,
  enforceBranchScope,
  blockBranchScope,
  requireTenantAdmin,
  getTenantPlan,
} from "../auth";
import { queryProductsByFilters, productFiltersSchema } from "../services/product-filters";
import { generatePriceListPdf } from "../services/pdf/price-list";
import { sanitizeLongText, sanitizeShortText } from "../security/sanitize";
import { validateBody, validateQuery } from "../middleware/validate";
import { resolveProductUnitPrice } from "../services/pricing";
import { requireAddon } from "../middleware/require-addon";
import { ensureStatusExists, getStatuses, normalizeStatusCode } from "../services/statuses";
import { normalizeProductCode } from "../storage/products";
import { db, pool } from "../db";
import * as XLSX from "xlsx";
import { statusDefinitions, productCustomFieldDefinitions, productCustomFieldValues } from "@shared/schema";
import { and, eq, inArray, asc, sql } from "drizzle-orm";

const sanitizeOptionalShort = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().transform((value) => sanitizeShortText(value, max)).optional()
  );

const sanitizeOptionalLong = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().transform((value) => sanitizeLongText(value, max)).optional()
  );

const pricingModeSchema = z.enum(["MANUAL", "MARGIN"]);

const productBaseSchema = z.object({
  name: z.string().transform((value) => sanitizeShortText(value, 200)).refine((value) => value.length >= 2, "Nombre inválido"),
  description: sanitizeOptionalLong(1000).nullable(),
  price: z.coerce.number().min(0),
  sku: sanitizeOptionalShort(100).nullable(),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  cost: z.coerce.number().min(0).optional().nullable(),
  stock: z.coerce.number().int().min(0).optional().nullable(),
  pricingMode: pricingModeSchema.optional().default("MANUAL"),
  costAmount: z.coerce.number().min(0).optional().nullable(),
  costCurrency: sanitizeOptionalShort(10).nullable(),
  marginPct: z.coerce.number().min(0).max(1000).optional().nullable(),
  statusCode: z.string().max(40).optional().nullable(),
  customFieldValues: z.record(z.any()).optional(),
});

const productInputSchema = productBaseSchema.superRefine((value, ctx) => {
  const mode = (value.pricingMode || "MANUAL").toUpperCase();
  if (mode === "MARGIN") {
    if (value.costAmount === undefined || value.costAmount === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Costo requerido en modo margen", path: ["costAmount"] });
    }
    if (value.marginPct === undefined || value.marginPct === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Margen requerido en modo margen", path: ["marginPct"] });
    }
  }
});

const productUpdateSchema = productBaseSchema.partial().superRefine((value, ctx) => {
  const mode = (value.pricingMode || "MANUAL").toUpperCase();
  if (mode === "MARGIN") {
    if (value.costAmount === undefined || value.costAmount === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Costo requerido en modo margen", path: ["costAmount"] });
    }
    if (value.marginPct === undefined || value.marginPct === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Margen requerido en modo margen", path: ["marginPct"] });
    }
  }
});



const lookupQuerySchema = z.object({
  code: z.string().transform((value) => normalizeProductCode(sanitizeShortText(value, 120))).refine((value) => value.length > 0, "Código requerido"),
});

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

async function ensureProductStatusForCreate(tenantId: number, rawStatusCode?: string | null) {
  if (rawStatusCode) {
    const normalized = normalizeStatusCode(rawStatusCode);
    await ensureStatusExists(tenantId, "PRODUCT", normalized);
    return normalized;
  }

  const activeStatuses = await getStatuses(tenantId, "PRODUCT", false);
  if (activeStatuses.length > 0) {
    const defaultStatus = activeStatuses.find((s) => s.isDefault) || activeStatuses[0];
    return defaultStatus.code;
  }

  const [created] = await db.insert(statusDefinitions).values({
    tenantId,
    entityType: "PRODUCT",
    code: "ACTIVE",
    label: "Activo",
    color: "#10B981",
    isDefault: true,
    isActive: true,
    sortOrder: 1,
  }).onConflictDoNothing().returning();

  if (created?.code) return created.code;

  const [existing] = await db.select().from(statusDefinitions).where(and(eq(statusDefinitions.tenantId, tenantId), eq(statusDefinitions.entityType, "PRODUCT"), eq(statusDefinitions.code, "ACTIVE"))).limit(1);
  return existing?.code || "ACTIVE";
}



const productCustomFieldTypeSchema = z.enum([
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "DECIMAL",
  "BOOLEAN",
  "DATE",
  "SELECT",
  "MULTISELECT",
  "COLOR",
]);

const customFieldDefinitionInputSchema = z.object({
  label: z.string().min(1).max(160),
  fieldKey: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/),
  fieldType: productCustomFieldTypeSchema,
  required: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
  isFilterable: z.boolean().optional().default(false),
  filterType: z.enum(["EXACT", "RANGE", "FACET"]).optional().default("EXACT"),
  config: z.object({
    options: z.array(z.object({ value: z.string(), label: z.string().optional() })).optional().default([]),
    showInForm: z.boolean().optional().default(true),
    showInTable: z.boolean().optional().default(false),
    showInDetail: z.boolean().optional().default(true),
    showInExport: z.boolean().optional().default(false),
    showInDocument: z.boolean().optional().default(false),
    placeholder: z.string().optional(),
  }).optional().default({}),
});

function normalizeCustomFieldConfig(config: any = {}) {
  return {
    options: Array.isArray(config?.options) ? config.options : [],
    showInForm: config?.showInForm !== false,
    showInTable: config?.showInTable === true,
    showInDetail: config?.showInDetail !== false,
    showInExport: config?.showInExport === true,
    showInDocument: config?.showInDocument === true,
    placeholder: typeof config?.placeholder === "string" ? config.placeholder : undefined,
  };
}

function normalizeCustomFieldValueForStore(def: any, rawValue: unknown) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return { valueText: null, valueNumber: null, valueBoolean: null };
  }

  switch (def.fieldType) {
    case "NUMBER":
    case "DECIMAL": {
      const n = Number(rawValue);
      if (!Number.isFinite(n)) throw new Error(`Valor inválido para ${def.fieldKey}`);
      return { valueText: null, valueNumber: String(n), valueBoolean: null };
    }
    case "BOOLEAN": {
      const b = rawValue === true || rawValue === "true" || rawValue === 1 || rawValue === "1";
      return { valueText: null, valueNumber: null, valueBoolean: b };
    }
    case "MULTISELECT": {
      const arr = Array.isArray(rawValue) ? rawValue.map((x) => String(x)) : [String(rawValue)];
      return { valueText: JSON.stringify(arr), valueNumber: null, valueBoolean: null };
    }
    default:
      return { valueText: String(rawValue), valueNumber: null, valueBoolean: null };
  }
}

function normalizeCustomFieldValueForResponse(def: any, row: any) {
  if (!row) return null;
  if (def.fieldType === "NUMBER" || def.fieldType === "DECIMAL") return row.valueNumber !== null ? Number(row.valueNumber) : null;
  if (def.fieldType === "BOOLEAN") return row.valueBoolean;
  if (def.fieldType === "MULTISELECT") {
    if (!row.valueText) return [];
    try { return JSON.parse(row.valueText); } catch { return []; }
  }
  return row.valueText;
}

async function upsertProductCustomFieldValues(tenantId: number, productId: number, payload: Record<string, unknown>) {
  const defs = await db
    .select()
    .from(productCustomFieldDefinitions)
    .where(and(eq(productCustomFieldDefinitions.tenantId, tenantId), eq(productCustomFieldDefinitions.isActive, true)));

  const defsByKey = new Map(defs.map((d) => [d.fieldKey, d]));

  for (const def of defs) {
    const value = payload[def.fieldKey];
    if (def.required && (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0))) {
      throw new Error(`Campo obligatorio faltante: ${def.label}`);
    }
  }

  for (const [fieldKey, rawValue] of Object.entries(payload || {})) {
    const def = defsByKey.get(fieldKey);
    if (!def) continue;
    const normalized = normalizeCustomFieldValueForStore(def, rawValue);
    await db
      .insert(productCustomFieldValues)
      .values({
        tenantId,
        productId,
        fieldDefinitionId: def.id,
        valueText: normalized.valueText,
        valueNumber: normalized.valueNumber,
        valueBoolean: normalized.valueBoolean,
      })
      .onConflictDoUpdate({
        target: [productCustomFieldValues.productId, productCustomFieldValues.fieldDefinitionId],
        set: {
          valueText: normalized.valueText,
          valueNumber: normalized.valueNumber,
          valueBoolean: normalized.valueBoolean,
        },
      });
  }
}

async function getCustomFieldDefinitions(tenantId: number) {
  const defs = await db
    .select()
    .from(productCustomFieldDefinitions)
    .where(eq(productCustomFieldDefinitions.tenantId, tenantId))
    .orderBy(asc(productCustomFieldDefinitions.sortOrder), asc(productCustomFieldDefinitions.id));
  return defs.map((d) => ({ ...d, config: normalizeCustomFieldConfig(d.config) }));
}

async function filterProductIdsByCustomFilters(tenantId: number, baseIds: number[], customFilters: Record<string, any>) {
  if (!baseIds.length || !customFilters || Object.keys(customFilters).length === 0) return baseIds;
  const defs = await db
    .select()
    .from(productCustomFieldDefinitions)
    .where(and(eq(productCustomFieldDefinitions.tenantId, tenantId), eq(productCustomFieldDefinitions.isActive, true)));
  const defsByKey = new Map(defs.map((d) => [d.fieldKey, d]));

  let current = new Set(baseIds);
  for (const [fieldKey, filterValue] of Object.entries(customFilters)) {
    const def = defsByKey.get(fieldKey);
    if (!def || filterValue === undefined || filterValue === null || filterValue === "" || !current.size) continue;
    const ids = Array.from(current);
    let rows: Array<{ productId: number }> = [];

    if (def.fieldType === "NUMBER" || def.fieldType === "DECIMAL") {
      const min = Number((filterValue as any)?.min ?? filterValue);
      const max = Number((filterValue as any)?.max ?? filterValue);
      rows = (await db.execute(sql`
        SELECT product_id as "productId"
        FROM product_custom_field_values
        WHERE tenant_id = ${tenantId}
          AND field_definition_id = ${def.id}
          AND product_id = ANY(${ids})
          AND (${Number.isFinite(min) ? sql`value_number >= ${String(min)}` : sql`1=1`})
          AND (${Number.isFinite(max) ? sql`value_number <= ${String(max)}` : sql`1=1`})
      `)).rows as any;
    } else if (def.fieldType === "BOOLEAN") {
      const boolValue = filterValue === true || filterValue === "true" || filterValue === 1 || filterValue === "1";
      rows = (await db.execute(sql`
        SELECT product_id as "productId"
        FROM product_custom_field_values
        WHERE tenant_id = ${tenantId}
          AND field_definition_id = ${def.id}
          AND product_id = ANY(${ids})
          AND value_boolean = ${boolValue}
      `)).rows as any;
    } else if (def.fieldType === "MULTISELECT") {
      const arr = Array.isArray(filterValue) ? filterValue : [filterValue];
      rows = (await db.execute(sql`
        SELECT product_id as "productId"
        FROM product_custom_field_values
        WHERE tenant_id = ${tenantId}
          AND field_definition_id = ${def.id}
          AND product_id = ANY(${ids})
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(value_text::jsonb, '[]'::jsonb)) AS j(v)
            WHERE j.v = ANY(${arr.map(String)})
          )
      `)).rows as any;
    } else {
      const arr = Array.isArray(filterValue) ? filterValue : [filterValue];
      rows = (await db.execute(sql`
        SELECT product_id as "productId"
        FROM product_custom_field_values
        WHERE tenant_id = ${tenantId}
          AND field_definition_id = ${def.id}
          AND product_id = ANY(${ids})
          AND value_text = ANY(${arr.map(String)})
      `)).rows as any;
    }
    current = new Set(rows.map((r) => Number(r.productId)));
  }
  return Array.from(current);
}

async function buildCustomFilterFacets(tenantId: number, productIds: number[]) {
  if (!productIds.length) return {};
  const defs = await db
    .select()
    .from(productCustomFieldDefinitions)
    .where(and(eq(productCustomFieldDefinitions.tenantId, tenantId), eq(productCustomFieldDefinitions.isFilterable, true), eq(productCustomFieldDefinitions.isActive, true)));

  const result: Record<string, any[]> = {};
  for (const def of defs) {
    if (def.fieldType === "BOOLEAN") {
      const rows = (await db.execute(sql`
        SELECT COALESCE(value_boolean, false) as value, COUNT(*)::int as count
        FROM product_custom_field_values
        WHERE tenant_id = ${tenantId}
          AND field_definition_id = ${def.id}
          AND product_id = ANY(${productIds})
        GROUP BY COALESCE(value_boolean, false)
      `)).rows as any[];
      result[def.fieldKey] = rows.map((r) => ({ value: Boolean(r.value), count: Number(r.count) }));
      continue;
    }

    if (def.fieldType === "MULTISELECT") {
      const rows = (await db.execute(sql`
        SELECT v.value as value, COUNT(*)::int as count
        FROM product_custom_field_values f,
             LATERAL jsonb_array_elements_text(COALESCE(f.value_text::jsonb, '[]'::jsonb)) v(value)
        WHERE f.tenant_id = ${tenantId}
          AND f.field_definition_id = ${def.id}
          AND f.product_id = ANY(${productIds})
        GROUP BY v.value
        ORDER BY count DESC
      `)).rows as any[];
      result[def.fieldKey] = rows.map((r) => ({ value: String(r.value), count: Number(r.count) }));
      continue;
    }

    const rows = (await db.execute(sql`
      SELECT value_text as value, COUNT(*)::int as count
      FROM product_custom_field_values
      WHERE tenant_id = ${tenantId}
        AND field_definition_id = ${def.id}
        AND product_id = ANY(${productIds})
        AND value_text IS NOT NULL
      GROUP BY value_text
      ORDER BY count DESC
    `)).rows as any[];
    result[def.fieldKey] = rows.map((r) => ({ value: String(r.value), count: Number(r.count) }));
  }

  return result;
}

async function resolveTenantStockMode(tenantId: number): Promise<{ stockMode: "global" | "by_branch"; branchesCount: number }> {
  const branchesCount = Number(await storage.countBranchesByTenant(tenantId) || 0);
  if (branchesCount <= 0) return { stockMode: "global", branchesCount: 0 };
  const config = await storage.getConfig(tenantId);
  const raw = (config?.configJson as any)?.inventory?.stockMode;
  return { stockMode: raw === "by_branch" ? "by_branch" : "global", branchesCount };
}

async function persistTenantStockMode(tenantId: number, stockMode: "global" | "by_branch") {
  const config = await storage.getConfig(tenantId);
  const current = ((config?.configJson as Record<string, any>) || {});
  const next = {
    ...current,
    inventory: {
      ...(current.inventory || {}),
      stockMode,
    },
  };
  await storage.upsertConfig({ tenantId, configJson: next as any });
}

export function registerProductRoutes(app: Express) {
  app.get("/api/product-categories", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const data = await storage.getProductCategories(req.auth!.tenantId!);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    "/api/product-categories",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    validateBody(z.object({ name: z.string().transform((value) => sanitizeShortText(value, 120)).refine((value) => value.length >= 2, "Nombre inválido") })),
    async (req, res) => {
    try {
      const data = await storage.createProductCategory({
        tenantId: req.auth!.tenantId!,
        name: req.body.name,
      });
      res.status(201).json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/products/custom-fields", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const data = await getCustomFieldDefinitions(tenantId);
      res.json({ data });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "No se pudieron listar campos personalizados" });
    }
  });

  app.post("/api/products/custom-fields", tenantAuth, requireTenantAdmin, requireFeature("products"), blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const bodyRaw = customFieldDefinitionInputSchema.parse(req.body || {});
      const body = {
        ...bodyRaw,
        label: sanitizeShortText(bodyRaw.label, 160),
        fieldKey: sanitizeShortText(bodyRaw.fieldKey.toLowerCase().replace(/\s+/g, "_"), 80),
      };
      const [created] = await db.insert(productCustomFieldDefinitions).values({
        tenantId,
        fieldKey: body.fieldKey,
        label: body.label,
        fieldType: body.fieldType,
        required: body.required,
        sortOrder: body.sortOrder,
        config: normalizeCustomFieldConfig(body.config),
        isActive: body.isActive,
        isFilterable: body.isFilterable,
        filterType: body.filterType,
      }).returning();
      res.status(201).json({ data: { ...created, config: normalizeCustomFieldConfig(created.config) } });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Campo personalizado inválido", code: "PRODUCT_CUSTOM_FIELD_INVALID", details: err.errors });
      if (err?.code === "23505") return res.status(409).json({ error: "La clave interna ya existe", code: "PRODUCT_CUSTOM_FIELD_DUPLICATE" });
      res.status(500).json({ error: err.message || "No se pudo crear el campo" });
    }
  });

  app.put("/api/products/custom-fields/:id", tenantAuth, requireTenantAdmin, requireFeature("products"), blockBranchScope, async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const id = Number(req.params.id);
      const bodyRaw = customFieldDefinitionInputSchema.partial().parse(req.body || {});
      const body: any = {
        ...bodyRaw,
        ...(bodyRaw.label !== undefined ? { label: sanitizeShortText(bodyRaw.label, 160) } : {}),
        ...(bodyRaw.fieldKey !== undefined ? { fieldKey: sanitizeShortText(bodyRaw.fieldKey.toLowerCase().replace(/\s+/g, "_"), 80) } : {}),
      };
      const [updated] = await db
        .update(productCustomFieldDefinitions)
        .set({
          ...(body.fieldKey !== undefined ? { fieldKey: body.fieldKey } : {}),
          ...(body.label !== undefined ? { label: body.label } : {}),
          ...(body.fieldType !== undefined ? { fieldType: body.fieldType } : {}),
          ...(body.required !== undefined ? { required: body.required } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.config !== undefined ? { config: normalizeCustomFieldConfig(body.config) } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.isFilterable !== undefined ? { isFilterable: body.isFilterable } : {}),
          ...(body.filterType !== undefined ? { filterType: body.filterType } : {}),
        })
        .where(and(eq(productCustomFieldDefinitions.id, id), eq(productCustomFieldDefinitions.tenantId, tenantId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Campo no encontrado" });
      res.json({ data: { ...updated, config: normalizeCustomFieldConfig(updated.config) } });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Campo personalizado inválido", code: "PRODUCT_CUSTOM_FIELD_INVALID", details: err.errors });
      if (err?.code === "23505") return res.status(409).json({ error: "La clave interna ya existe", code: "PRODUCT_CUSTOM_FIELD_DUPLICATE" });
      res.status(500).json({ error: err.message || "No se pudo actualizar el campo" });
    }
  });

  app.get("/api/products", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const { stockMode, branchesCount } = await resolveTenantStockMode(tenantId);
      const byBranchMode = stockMode === "by_branch";
      const filters = productFiltersSchema.parse(req.query);
      const customFiltersRaw = typeof req.query.customFilters === "string" ? req.query.customFilters : "";
      const customFilters = customFiltersRaw ? JSON.parse(customFiltersRaw) : {};

      const baseResult = await queryProductsByFilters(tenantId, byBranchMode, filters, { noPagination: true });
      const baseIds = baseResult.data.map((p) => p.id);
      const filteredIds = await filterProductIdsByCustomFilters(tenantId, baseIds, customFilters);
      const { data, total } = await queryProductsByFilters(tenantId, byBranchMode, filters, { productIds: filteredIds });

      const productIds = data.map((p) => p.id);
      const productIdSet = new Set(productIds);
      const branchStockMap = new Map<number, Array<{ branchId: number; branchName: string; stock: number }>>();

      if (byBranchMode && productIds.length) {
        const allStockRows = await storage.getStockSummaryByTenant(tenantId);
        for (const row of allStockRows) {
          if (!productIdSet.has(row.productId)) continue;
          const list = branchStockMap.get(row.productId) || [];
          list.push({ branchId: row.branchId, branchName: row.branchName, stock: row.stock });
          branchStockMap.set(row.productId, list);
        }
      }

      const [statuses, fieldDefs, customValuesRows, customFilterFacets] = await Promise.all([
        getStatuses(tenantId, "PRODUCT", true),
        getCustomFieldDefinitions(tenantId),
        productIds.length
          ? db.select().from(productCustomFieldValues).where(and(eq(productCustomFieldValues.tenantId, tenantId), inArray(productCustomFieldValues.productId, productIds)))
          : Promise.resolve([] as any[]),
        buildCustomFilterFacets(tenantId, filteredIds),
      ]);

      const statusMap = new Map(statuses.map((s) => [s.code, s]));
      const defsById = new Map(fieldDefs.map((d) => [d.id, d]));
      const valuesByProduct = new Map<number, Record<string, any>>();
      for (const row of customValuesRows as any[]) {
        const def = defsById.get(row.fieldDefinitionId);
        if (!def) continue;
        const productValues = valuesByProduct.get(row.productId) || {};
        productValues[def.fieldKey] = normalizeCustomFieldValueForResponse(def, row);
        valuesByProduct.set(row.productId, productValues);
      }

      const normalized = await Promise.all(data.map(async (p) => {
        const code = p.statusCode || (p.isActive ? "ACTIVE" : "INACTIVE");
        return {
          ...p,
          stockTotal: toNumber(p.stockTotal),
          customFieldValues: valuesByProduct.get(p.id) || {},
          status: statusMap.get(code) ? { code, label: statusMap.get(code)!.label, color: statusMap.get(code)!.color } : { code, label: code, color: "#6B7280" },
          estimatedSalePrice: await resolveProductUnitPrice(p as any, tenantId, "ARS").catch(() => Number(p.price)),
          branchStock: byBranchMode ? (branchStockMap.get(p.id) || []) : undefined,
        };
      }));

      const page = filters.page ?? 1;
      const pageSize = filters.pageSize ?? 20;
      res.json({
        data: normalized,
        customFieldDefinitions: fieldDefs,
        customFilterFacets,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          stockMode,
          branchesCount,
        },
        stockMode,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Filtros inválidos. Revisá los valores ingresados.", code: "PRODUCT_FILTERS_INVALID" });
      }
      if ((err as any)?.name === 'SyntaxError') {
        return res.status(400).json({ error: "customFilters inválido", code: "PRODUCT_CUSTOM_FILTERS_INVALID" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/products/lookup", tenantAuth, requireFeature("products"), requireAddon("barcode_scanner"), validateQuery(lookupQuerySchema), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const query = req.query as z.infer<typeof lookupQuerySchema>;
      const product = await storage.getProductByCode(tenantId, query.code);
      if (!product) return res.status(404).json({ error: "Producto no encontrado", code: "PRODUCT_NOT_FOUND" });
      const stockTotal = Number((product as any).stock ?? 0);
      const estimatedSalePrice = await resolveProductUnitPrice(product as any, tenantId, "ARS").catch(() => Number(product.price));
      return res.json({ product: { id: product.id, name: product.name, code: product.sku, price: product.price, stock: stockTotal, stockTotal, estimatedSalePrice } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "No se pudo buscar el producto" });
    }
  });
  app.post(
    "/api/products",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    validateBody(productInputSchema),
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const { stockMode } = await resolveTenantStockMode(tenantId);
      const byBranchMode = stockMode === "by_branch";
      const payload = req.body as z.infer<typeof productInputSchema>;

      const statusCode = await ensureProductStatusForCreate(tenantId, payload.statusCode || null);
      const customFieldValues = (req.body as any).customFieldValues && typeof (req.body as any).customFieldValues === "object" ? (req.body as any).customFieldValues : {};
      const data = await storage.createProduct({
        tenantId,
        name: payload.name,
        description: payload.description || null,
        price: String(payload.price),
        sku: payload.sku ? normalizeProductCode(payload.sku) : null,
        categoryId: payload.categoryId || null,
        cost: payload.cost !== null && payload.cost !== undefined ? String(payload.cost) : null,
        pricingMode: payload.pricingMode || "MANUAL",
        costAmount: payload.costAmount !== null && payload.costAmount !== undefined ? String(payload.costAmount) : null,
        costCurrency: payload.costCurrency || null,
        marginPct: payload.marginPct !== null && payload.marginPct !== undefined ? String(payload.marginPct) : null,
        stock: byBranchMode ? null : (payload.stock ?? 0),
        statusCode,
        isActive: statusCode !== "INACTIVE",
      });
      if (customFieldValues && Object.keys(customFieldValues).length) {
        await upsertProductCustomFieldValues(tenantId, data.id, customFieldValues);
      }
      res.status(201).json({ data });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "PRODUCT_INVALID", details: err.errors });
      }
      if (err?.message === "STATUS_NOT_FOUND") {
        return res.status(400).json({ error: "Estado de producto inválido", code: "PRODUCT_STATUS_INVALID" });
      }
      if (err?.code === "23505") {
        return res.status(409).json({ error: "El código SKU ya existe", code: "PRODUCT_SKU_DUPLICATE" });
      }
      if (err?.code === "23503") {
        return res.status(400).json({ error: "Categoría o referencia inválida", code: "PRODUCT_FK_INVALID" });
      }
      console.error("[products] PRODUCT_CREATE_ERROR", { requestId: req.requestId, route: req.path, code: err?.code, message: err?.message });
      res.status(500).json({ error: "No se pudo crear el producto", code: "PRODUCT_CREATE_ERROR", requestId: req.requestId || null });
    }
  });

  app.get("/api/products/:id/stock", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const product = await storage.getProductById(productId, tenantId);
      if (!product) return res.status(404).json({ error: "Producto no encontrado" });
      const { stockMode, branchesCount } = await resolveTenantStockMode(tenantId);

      if (stockMode !== "by_branch" || branchesCount <= 0) {
        return res.json({
          data: {
            stockByBranch: [],
            stockTotal: product.stock || 0,
            stockMode: "global",
            movements: [],
          },
        });
      }

      const [stockByBranch, branches] = await Promise.all([
        storage.getProductStockByBranch(productId, tenantId),
        storage.getBranches(tenantId),
      ]);
      const stockMap = new Map(stockByBranch.map((stock) => [stock.branchId, stock.stock ?? 0]));
      const stockView = branches.map((branch) => ({
        branchId: branch.id,
        branchName: branch.name,
        stock: stockMap.get(branch.id) ?? 0,
      }));
      const movements = await storage.getStockMovements(productId, tenantId);
      res.json({ data: { stockByBranch: stockView, movements, stockMode: "by_branch" } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch(
    "/api/products/:id/stock",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    enforceBranchScope,
    validateBody(z.object({
      mode: z.enum(["global", "by_branch"]),
      stock: z.coerce.number().int().min(0).optional(),
      branches: z.array(z.object({ branchId: z.coerce.number().int().positive(), stock: z.coerce.number().int().min(0) })).optional(),
      reason: sanitizeOptionalLong(200).nullable(),
    })),
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const { mode, stock, branches, reason } = req.body as { mode: "global" | "by_branch"; stock?: number; branches?: Array<{ branchId: number; stock: number }>; reason?: string | null };
      const product = await storage.getProductById(productId, tenantId);
      if (!product) return res.status(404).json({ error: "Producto no encontrado" });

      const { branchesCount } = await resolveTenantStockMode(tenantId);

      if (mode === "by_branch" && branchesCount <= 0) {
        return res.status(403).json({ error: "Stock por sucursal no disponible para este tenant", code: "FEATURE_NOT_ENABLED" });
      }

      if (mode === "global") {
        if (stock === undefined) return res.status(400).json({ error: "stock es obligatorio en modo global", code: "STOCK_REQUIRED" });
        await storage.updateProduct(productId, tenantId, { stock });
        await persistTenantStockMode(tenantId, "global");
        return res.json({ ok: true, productId, stockMode: "global", stock: { total: stock } });
      }

      const branchPayload = branches || [];
      if (!branchPayload.length) return res.status(400).json({ error: "branches es obligatorio en modo by_branch", code: "BRANCHES_REQUIRED" });
      const tenantBranches = await storage.getBranches(tenantId);
      const allowedIds = new Set(tenantBranches.map((b) => b.id));
      for (const item of branchPayload) {
        if (!allowedIds.has(item.branchId)) {
          return res.status(400).json({ error: `Sucursal inválida: ${item.branchId}`, code: "BRANCH_INVALID" });
        }
      }

      const existing = await storage.getProductStockByBranch(productId, tenantId);
      const existingMap = new Map(existing.map((x) => [x.branchId, Number(x.stock || 0)]));

      for (const item of branchPayload) {
        const before = existingMap.get(item.branchId) || 0;
        const after = Number(item.stock);
        await storage.upsertProductStockByBranch({ tenantId, productId, branchId: item.branchId, stock: after });
        const delta = after - before;
        if (delta !== 0) {
          await storage.createStockMovement({
            tenantId,
            productId,
            branchId: item.branchId,
            quantity: String(Math.abs(delta)),
            reason: reason || "Renovación stock",
            userId: req.auth!.userId,
          });
        }
      }

      const updated = await storage.getProductStockByBranch(productId, tenantId);
      const stockTotal = updated.reduce((acc, row) => acc + Number(row.stock || 0), 0);
      await storage.updateProduct(productId, tenantId, { stock: stockTotal });
      await persistTenantStockMode(tenantId, "by_branch");
      return res.json({ ok: true, productId, stockMode: "by_branch", stock: { total: stockTotal, byBranch: updated } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put(
    "/api/products/:id",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    validateBody(productUpdateSchema),
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const existing = await storage.getProductById(productId, tenantId);
      if (!existing) return res.status(404).json({ error: "Producto no encontrado" });
      const { stockMode } = await resolveTenantStockMode(tenantId);
      const byBranchMode = stockMode === "by_branch";

      const payload = req.body as z.infer<typeof productUpdateSchema> & { customFieldValues?: Record<string, unknown> };

      const updateData: any = {};
      if (payload.name !== undefined) updateData.name = payload.name;
      if (payload.description !== undefined) updateData.description = payload.description;
      if (payload.price !== undefined) updateData.price = String(payload.price);
      if (payload.cost !== undefined) updateData.cost = payload.cost !== null ? String(payload.cost) : null;
      if (payload.pricingMode !== undefined) updateData.pricingMode = payload.pricingMode;
      if (payload.costAmount !== undefined) updateData.costAmount = payload.costAmount !== null ? String(payload.costAmount) : null;
      if (payload.costCurrency !== undefined) updateData.costCurrency = payload.costCurrency || null;
      if (payload.marginPct !== undefined) updateData.marginPct = payload.marginPct !== null ? String(payload.marginPct) : null;
      if (payload.stock !== undefined && !byBranchMode) updateData.stock = payload.stock;
      if (payload.sku !== undefined) updateData.sku = payload.sku ? normalizeProductCode(payload.sku) : null;
      if (payload.categoryId !== undefined) updateData.categoryId = payload.categoryId;
      if (payload.statusCode !== undefined) {
        const statusCode = normalizeStatusCode(payload.statusCode || "");
        await ensureStatusExists(tenantId, "PRODUCT", statusCode);
        updateData.statusCode = statusCode;
        updateData.isActive = statusCode !== "INACTIVE";
      }

      const product = await storage.updateProduct(productId, tenantId, updateData);
      if (payload.customFieldValues && typeof payload.customFieldValues === "object") {
        await upsertProductCustomFieldValues(tenantId, productId, payload.customFieldValues);
      }
      res.json({ data: product });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", code: "PRODUCT_INVALID", details: err.errors });
      }
      if (err?.message === "STATUS_NOT_FOUND") {
        return res.status(400).json({ error: "Estado de producto inválido", code: "PRODUCT_STATUS_INVALID" });
      }
      if (err?.code === "23505") {
        return res.status(409).json({ error: "El código SKU ya existe", code: "PRODUCT_SKU_DUPLICATE" });
      }
      if (err?.code === "23503") {
        return res.status(400).json({ error: "Categoría o referencia inválida", code: "PRODUCT_FK_INVALID" });
      }
      console.error("[products] PRODUCT_CREATE_ERROR", { requestId: req.requestId, route: req.path, code: err?.code, message: err?.message });
      res.status(500).json({ error: "No se pudo crear el producto", code: "PRODUCT_CREATE_ERROR", requestId: req.requestId || null });
    }
  });

  app.patch(
    "/api/products/:id/toggle",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const existing = await storage.getProductById(productId, tenantId);
      if (!existing) return res.status(404).json({ error: "Producto no encontrado" });
      const nextActive = !existing.isActive;
      await storage.updateProduct(productId, tenantId, { isActive: nextActive, statusCode: nextActive ? "ACTIVE" : "INACTIVE" });
      res.json({ data: { isActive: nextActive, statusCode: nextActive ? "ACTIVE" : "INACTIVE" } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  app.delete(
    "/api/products/:id",
    tenantAuth,
    requireTenantAdmin,
    requireFeature("products"),
    blockBranchScope,
    async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const productId = parseInt(req.params.id as string);
      const existing = await storage.getProductById(productId, tenantId);
      if (!existing) return res.status(404).json({ error: "Producto no encontrado", code: "PRODUCT_NOT_FOUND" });
      await storage.updateProduct(productId, tenantId, { isActive: false, statusCode: "INACTIVE" });
      res.json({ data: { id: productId, deleted: true } });
    } catch {
      res.status(500).json({ error: "No se pudo eliminar el producto", code: "PRODUCT_DELETE_ERROR" });
    }
  });

  app.get("/api/products/export/sheet", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const { stockMode } = await resolveTenantStockMode(tenantId);
      const byBranchMode = stockMode === "by_branch";
      const filters = productFiltersSchema.parse(req.query || {});
      const customFiltersRaw = typeof req.query.customFilters === "string" ? req.query.customFilters : "";
      const customFilters = customFiltersRaw ? JSON.parse(customFiltersRaw) : {};
      const baseResult = await queryProductsByFilters(tenantId, byBranchMode, filters, { noPagination: true });
      const filteredIds = await filterProductIdsByCustomFilters(tenantId, baseResult.data.map((p) => p.id), customFilters);
      const result = await queryProductsByFilters(tenantId, byBranchMode, filters, { productIds: filteredIds, noPagination: true });
      const defs = (await getCustomFieldDefinitions(tenantId)).filter((d: any) => d.config?.showInExport);
      const valuesRows = filteredIds.length
        ? await db.select().from(productCustomFieldValues).where(and(eq(productCustomFieldValues.tenantId, tenantId), inArray(productCustomFieldValues.productId, filteredIds)))
        : [];
      const defsById = new Map(defs.map((d: any) => [d.id, d]));
      const valuesByProduct = new Map<number, Record<string, any>>();
      for (const row of valuesRows as any[]) {
        const def = defsById.get(row.fieldDefinitionId);
        if (!def) continue;
        const m = valuesByProduct.get(row.productId) || {};
        m[def.fieldKey] = normalizeCustomFieldValueForResponse(def, row);
        valuesByProduct.set(row.productId, m);
      }
      const rows = result.data.map((p: any) => {
        const custom = valuesByProduct.get(p.id) || {};
        const base: Record<string, any> = {
          id: p.id,
          nombre: p.name,
          sku: p.sku || "",
          descripcion: p.description || "",
          precio: Number(p.price || 0),
          stock: Number(p.stockTotal || p.stock || 0),
          activo: p.isActive ? "Sí" : "No",
        };
        for (const d of defs) {
          const v = custom[d.fieldKey];
          base[d.label] = Array.isArray(v) ? v.join(", ") : (v ?? "");
        }
        return base;
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Productos");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=productos.xlsx");
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: "No se pudo exportar planilla", code: "PRODUCT_EXPORT_SHEET_ERROR" });
    }
  });

  app.get("/api/products/export", tenantAuth, requireFeature("products"), async (req, res) => {
    try {
      const tenantId = req.auth!.tenantId!;
      const plan = await getTenantPlan(tenantId);
      const pdfBuffer = await generatePriceListPdf(tenantId, { watermarkOrbia: (plan?.planCode || "").toUpperCase() === "ECONOMICO" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=productos.pdf");
      res.send(pdfBuffer);
    } catch (err: any) {
      res.status(500).json({ error: "No se pudo generar el PDF", code: "PDF_EXPORT_ERROR" });
    }
  });
}
