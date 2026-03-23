import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  orderFieldDefinitions,
  orderTypeDefinitions,
  orderTypePresets,
  type InsertOrderFieldDefinition,
  type InsertOrderTypePreset,
} from "@shared/schema";
import { db } from "../db";
import { STANDARD_ORDER_TYPES } from "@shared/order-types";
import { badRequest, notFound, HttpError } from "../lib/http-errors";
import {
  buildNativeOrderFieldTemplate,
  resolveNativeOrderFieldKind,
  resolveOrderFieldDefinition,
} from "@shared/order-fields";
import {
  normalizeFieldTypeInput,
  normalizeOrderPresetFieldConfig,
  ORDER_PRESET_ALLOWED_FILE_EXTENSIONS,
} from "./order-presets.shared";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const MAX_PRESETS_PER_TYPE = 3;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function slugifyFieldKey(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "campo";
}

export function slugifyPresetCode(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "preset";
}

async function getTypeOrThrow(tenantId: number, code: string) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  let [typeRow] = await db
    .select()
    .from(orderTypeDefinitions)
    .where(
      and(
        eq(orderTypeDefinitions.tenantId, tenantId),
        eq(orderTypeDefinitions.code, normalizedCode)
      )
    );

  if (!typeRow) {
    // Auto-create order type and default preset for existing tenants
    const labels = Object.fromEntries(STANDARD_ORDER_TYPES.map((type) => [type.code, type.label]));
    [typeRow] = await db.insert(orderTypeDefinitions).values({
      tenantId,
      code: normalizedCode,
      label: labels[normalizedCode] || normalizedCode,
      isActive: true,
    }).returning();
    await db.insert(orderTypePresets).values({
      tenantId,
      orderTypeId: typeRow.id,
      code: "default",
      label: "Default",
      isActive: true,
      sortOrder: 0,
    });
  }

  return typeRow;
}

async function getPresetOrThrow(tenantId: number, presetId: number) {
  const [preset] = await db
    .select()
    .from(orderTypePresets)
    .where(and(eq(orderTypePresets.id, presetId), eq(orderTypePresets.tenantId, tenantId)));
  if (!preset) throw notFound("PRESET_NOT_FOUND", "Preset no encontrado");
  return preset;
}

async function resolveUniqueFieldKey(
  tenantId: number,
  presetId: number,
  desired: string
): Promise<string> {
  const [existing] = await db
    .select({ id: orderFieldDefinitions.id })
    .from(orderFieldDefinitions)
    .where(
      and(
        eq(orderFieldDefinitions.tenantId, tenantId),
        eq(orderFieldDefinitions.presetId, presetId),
        eq(orderFieldDefinitions.fieldKey, desired),
        sql`${orderFieldDefinitions.deletedAt} IS NULL`
      )
    );
  if (!existing) return desired;

  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const candidate = `${desired}-${suffix}`.slice(0, 80);
    const [row] = await db
      .select({ id: orderFieldDefinitions.id })
      .from(orderFieldDefinitions)
      .where(
        and(
          eq(orderFieldDefinitions.tenantId, tenantId),
          eq(orderFieldDefinitions.presetId, presetId),
          eq(orderFieldDefinitions.fieldKey, candidate),
          sql`${orderFieldDefinitions.deletedAt} IS NULL`
        )
      );
    if (!row) return candidate;
  }

  throw new HttpError(409, "ORDER_FIELD_KEY_CONFLICT", "No se pudo generar un field_key único");
}


async function ensureDefaultPresetAndAttachLegacyFields(tenantId: number, orderTypeId: number) {
  let [defaultPreset] = await db
    .select()
    .from(orderTypePresets)
    .where(and(eq(orderTypePresets.tenantId, tenantId), eq(orderTypePresets.orderTypeId, orderTypeId), eq(orderTypePresets.code, "default")))
    .limit(1);

  if (!defaultPreset) {
    const [created] = await db.insert(orderTypePresets).values({
      tenantId,
      orderTypeId,
      code: "default",
      label: "Default",
      isActive: true,
      sortOrder: 0,
    }).returning();
    defaultPreset = created;
  }

  await db
    .update(orderFieldDefinitions)
    .set({ presetId: defaultPreset.id })
    .where(and(eq(orderFieldDefinitions.tenantId, tenantId), eq(orderFieldDefinitions.orderTypeId, orderTypeId), isNull(orderFieldDefinitions.presetId)));

  return defaultPreset;
}

function dedupeByFieldKey<T extends { fieldKey: string; id: number }>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const current = byKey.get(row.fieldKey);
    if (!current || row.id > current.id) byKey.set(row.fieldKey, row);
  }
  return Array.from(byKey.values());
}

async function getSystemDefaultTemplates(tenantId: number, orderTypeId: number) {
  const [defaultPreset] = await db
    .select({ id: orderTypePresets.id })
    .from(orderTypePresets)
    .where(
      and(
        eq(orderTypePresets.tenantId, tenantId),
        eq(orderTypePresets.orderTypeId, orderTypeId),
        eq(orderTypePresets.code, "default")
      )
    )
    .limit(1);

  const systemDefaults = await db
    .select()
    .from(orderFieldDefinitions)
    .where(
      and(
        eq(orderFieldDefinitions.tenantId, tenantId),
        eq(orderFieldDefinitions.orderTypeId, orderTypeId),
        eq(orderFieldDefinitions.isSystemDefault, true),
        sql`${orderFieldDefinitions.deletedAt} IS NULL`,
        defaultPreset
          ? eq(orderFieldDefinitions.presetId, defaultPreset.id)
          : isNull(orderFieldDefinitions.presetId)
      )
    )
    .orderBy(asc(orderFieldDefinitions.sortOrder), asc(orderFieldDefinitions.id));

  return dedupeByFieldKey(systemDefaults);
}

async function cloneMissingSystemDefaultsForPreset(tenantId: number, orderTypeId: number, presetId: number) {
  const systemDefaults = await getSystemDefaultTemplates(tenantId, orderTypeId);
  if (systemDefaults.length === 0) return;

  const existingTarget = await db
    .select({ id: orderFieldDefinitions.id, fieldKey: orderFieldDefinitions.fieldKey })
    .from(orderFieldDefinitions)
     .where(
      and(
        eq(orderFieldDefinitions.tenantId, tenantId),
        eq(orderFieldDefinitions.orderTypeId, orderTypeId),
        eq(orderFieldDefinitions.presetId, presetId),
        sql`${orderFieldDefinitions.deletedAt} IS NULL`
      )
    );

  const existingKeys = new Set(existingTarget.map((r) => r.fieldKey));

  for (const source of systemDefaults) {
    if (existingKeys.has(source.fieldKey)) continue;
    await db.insert(orderFieldDefinitions).values({
      tenantId,
      orderTypeId,
      presetId,
      fieldKey: source.fieldKey,
      label: source.label,
      fieldType: source.fieldType,
      required: source.required,
      sortOrder: source.sortOrder,
      config: source.config || {},
      isActive: true,
      isSystemDefault: true,
      visibleInTracking: source.visibleInTracking,
      useInAgenda: source.useInAgenda,
      deletedAt: null,
    });
  }
}

function pickCanonicalNativeField<T extends { id: number; fieldKey: string; isSystemDefault?: boolean | null }>(fields: T[], expectedFieldKey: string) {
  return [...fields].sort((a, b) => {
    const scoreA = (a.fieldKey === expectedFieldKey ? 4 : 0) + (a.isSystemDefault === true ? 2 : 0);
    const scoreB = (b.fieldKey === expectedFieldKey ? 4 : 0) + (b.isSystemDefault === true ? 2 : 0);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.id - b.id;
  })[0] || null;
}

async function ensureCanonicalNativeFieldsForPreset(tenantId: number, orderTypeId: number, presetId: number) {
  const existing = await db
    .select()
    .from(orderFieldDefinitions)
    .where(
      and(
        eq(orderFieldDefinitions.tenantId, tenantId),
        eq(orderFieldDefinitions.orderTypeId, orderTypeId),
        eq(orderFieldDefinitions.presetId, presetId),
        sql`${orderFieldDefinitions.deletedAt} IS NULL`
      )
    )
    .orderBy(asc(orderFieldDefinitions.sortOrder), asc(orderFieldDefinitions.id));

  const existingByKind = new Map<string, typeof existing>();
  for (const field of existing) {
    const kind = resolveNativeOrderFieldKind(field);
    if (!kind) continue;
    const current = existingByKind.get(kind) || [];
    current.push(field);
    existingByKind.set(kind, current);
  }

  for (const kind of ["customer", "phone", "description", "paid", "total"] as const) {
    const template = buildNativeOrderFieldTemplate(kind);
    const candidates = existingByKind.get(kind) || [];
    const current = pickCanonicalNativeField(candidates, template.fieldKey);

    if (candidates.length > 1) {
      const duplicateIds = candidates.filter((field) => field.id !== current?.id).map((field) => field.id);
      if (duplicateIds.length > 0) {
        await db.update(orderFieldDefinitions)
          .set({ deletedAt: new Date(), isActive: false, required: false, visibleInTracking: false })
          .where(inArray(orderFieldDefinitions.id, duplicateIds));
      }
    }

    if (!current) {
      await db.insert(orderFieldDefinitions).values({
        tenantId,
        orderTypeId,
        presetId,
        fieldKey: template.fieldKey,
        label: template.label,
        fieldType: template.fieldType,
        required: template.required,
        sortOrder: template.sortOrder,
        config: template.config,
        isActive: true,
        isSystemDefault: true,
        visibleInTracking: template.visibleInTracking,
        useInAgenda: false,
        deletedAt: null,
      });
      continue;
    }

    const normalizedCurrentType = normalizeFieldTypeInput(String(current.fieldType || ""));
    const expectedType = template.fieldType;
    const currentConfig = current.config && typeof current.config === "object" && !Array.isArray(current.config)
      ? { ...(current.config as Record<string, unknown>) }
      : {};
    const mergedConfig = normalizeOrderPresetFieldConfig(expectedType, { ...template.config, ...currentConfig });
    const needsUpdate = current.isSystemDefault !== true
      || normalizedCurrentType !== expectedType
      || current.fieldKey !== template.fieldKey
      || current.label !== template.label
      || current.sortOrder !== template.sortOrder
      || current.isActive !== true
      || Boolean(current.deletedAt);

    if (needsUpdate) {
      await db.update(orderFieldDefinitions)
        .set({
          fieldKey: template.fieldKey,
          label: template.label,
          fieldType: expectedType,
          sortOrder: template.sortOrder,
          config: mergedConfig,
          isSystemDefault: true,
          isActive: true,
          deletedAt: null,
          visibleInTracking: template.visibleInTracking,
        })
        .where(eq(orderFieldDefinitions.id, current.id));
    }
  }
}

async function findExistingNativeFieldForPreset(tenantId: number, presetId: number, kind: string, ignoreFieldId?: number) {
  const rows = await db
    .select()
    .from(orderFieldDefinitions)
    .where(
      and(
        eq(orderFieldDefinitions.tenantId, tenantId),
        eq(orderFieldDefinitions.presetId, presetId),
        sql`${orderFieldDefinitions.deletedAt} IS NULL`
      )
    );
  return rows.find((field) => resolveNativeOrderFieldKind(field) === kind && field.id !== ignoreFieldId) || null;
}

// ─────────────────────────────────────────────
// Storage API
// ─────────────────────────────────────────────
export const orderPresetsStorage = {
  // ── Types ────────────────────────────────────────────────────────────────
  async listOrderTypes(tenantId: number) {
    const existing = await db
      .select()
      .from(orderTypeDefinitions)
      .where(eq(orderTypeDefinitions.tenantId, tenantId))
      .orderBy(asc(orderTypeDefinitions.id));

    // Auto-create standard types if missing
    const existingCodes = new Set(existing.map((t) => t.code));
    const missing = STANDARD_ORDER_TYPES.filter((t) => !existingCodes.has(t.code));
    if (missing.length > 0) {
      for (const ot of missing) {
        const [typeRow] = await db.insert(orderTypeDefinitions).values({
          tenantId,
          code: ot.code,
          label: ot.label,
          isActive: true,
        }).returning();
        await db.insert(orderTypePresets).values({
          tenantId,
          orderTypeId: typeRow.id,
          code: "default",
          label: "Default",
          isActive: true,
          sortOrder: 0,
        });
        existing.push(typeRow);
      }
      // Re-sort by id
      existing.sort((a, b) => a.id - b.id);
    }

    return existing;
  },

  // ── Presets ──────────────────────────────────────────────────────────────
  async listPresetsByType(tenantId: number, code: string) {
    const typeRow = await getTypeOrThrow(tenantId, code);
    const defaultPreset = await ensureDefaultPresetAndAttachLegacyFields(tenantId, typeRow.id);
    await ensureCanonicalNativeFieldsForPreset(tenantId, typeRow.id, defaultPreset.id);
    const presets = await db
      .select()
      .from(orderTypePresets)
      .where(
        and(
          eq(orderTypePresets.tenantId, tenantId),
          eq(orderTypePresets.orderTypeId, typeRow.id)
        )
      )
      .orderBy(asc(orderTypePresets.sortOrder), asc(orderTypePresets.id));
    return { type: typeRow, presets };
  },

  async createPreset(
    tenantId: number,
    code: string,
    payload: { label: string; code?: string; sortOrder?: number }
  ) {
    const typeRow = await getTypeOrThrow(tenantId, code);
    const label = String(payload.label || "").trim();
    if (!label) throw badRequest("PRESET_VALIDATION_ERROR", "label es requerido");

    // Enforce max 3 active presets per type
    const existingActive = await db
      .select({ id: orderTypePresets.id })
      .from(orderTypePresets)
      .where(
        and(
          eq(orderTypePresets.tenantId, tenantId),
          eq(orderTypePresets.orderTypeId, typeRow.id),
          eq(orderTypePresets.isActive, true)
        )
      );
    if (existingActive.length >= MAX_PRESETS_PER_TYPE) {
      throw new HttpError(
        409,
        "PRESET_LIMIT_REACHED",
        `Máximo ${MAX_PRESETS_PER_TYPE} presets activos por tipo de pedido`
      );
    }

    // Generate slug from label if not provided
    const rawCode = payload.code
      ? slugifyPresetCode(payload.code)
      : slugifyPresetCode(label);

    // Ensure unique code per (tenant, type)
    let presetCode = rawCode;
    for (let i = 2; i <= 100; i++) {
      const [existing] = await db
        .select({ id: orderTypePresets.id })
        .from(orderTypePresets)
        .where(
          and(
            eq(orderTypePresets.tenantId, tenantId),
            eq(orderTypePresets.orderTypeId, typeRow.id),
            eq(orderTypePresets.code, presetCode)
          )
        );
      if (!existing) break;
      presetCode = `${rawCode}-${i}`;
    }

    const [maxSort] = await db
      .select({ sortOrder: orderTypePresets.sortOrder })
      .from(orderTypePresets)
      .where(
        and(
          eq(orderTypePresets.tenantId, tenantId),
          eq(orderTypePresets.orderTypeId, typeRow.id)
        )
      )
      .orderBy(desc(orderTypePresets.sortOrder))
      .limit(1);

    const values: InsertOrderTypePreset = {
      tenantId,
      orderTypeId: typeRow.id,
      code: presetCode,
      label,
      isActive: true,
      sortOrder: (maxSort?.sortOrder ?? -1) + 1,
    };

    const [created] = await db.insert(orderTypePresets).values(values).returning();
    await cloneMissingSystemDefaultsForPreset(tenantId, typeRow.id, created.id);
    await ensureCanonicalNativeFieldsForPreset(tenantId, typeRow.id, created.id);
    return { type: typeRow, preset: created };
  },

  async updatePreset(
    tenantId: number,
    presetId: number,
    patch: { label?: string; isActive?: boolean; sortOrder?: number }
  ) {
    const preset = await getPresetOrThrow(tenantId, presetId);

    // If re-activating: check limit
    if (patch.isActive === true && !preset.isActive) {
      const existingActive = await db
        .select({ id: orderTypePresets.id })
        .from(orderTypePresets)
        .where(
          and(
            eq(orderTypePresets.tenantId, tenantId),
            eq(orderTypePresets.orderTypeId, preset.orderTypeId),
            eq(orderTypePresets.isActive, true)
          )
        );
      if (existingActive.length >= MAX_PRESETS_PER_TYPE) {
        throw new HttpError(
          409,
          "PRESET_LIMIT_REACHED",
          `Máximo ${MAX_PRESETS_PER_TYPE} presets activos por tipo de pedido`
        );
      }
    }

    const update: Partial<InsertOrderTypePreset> = {};
    if (patch.label !== undefined) {
      const label = String(patch.label || "").trim();
      if (!label) throw badRequest("PRESET_VALIDATION_ERROR", "label no puede ser vacío");
      update.label = label;
    }
    if (patch.isActive !== undefined) {
      update.isActive = Boolean(patch.isActive);
    }
    if (patch.sortOrder !== undefined) update.sortOrder = Number(patch.sortOrder);

    const [saved] = await db
      .update(orderTypePresets)
      .set(update)
      .where(and(eq(orderTypePresets.id, presetId), eq(orderTypePresets.tenantId, tenantId)))
      .returning();
    return saved;
  },

  // ── Fields by preset ─────────────────────────────────────────────────────
  async listFieldsByPreset(tenantId: number, presetId: number, options?: { includeInactive?: boolean }) {
    const preset = await getPresetOrThrow(tenantId, presetId);
    await ensureDefaultPresetAndAttachLegacyFields(tenantId, preset.orderTypeId);
    await ensureCanonicalNativeFieldsForPreset(tenantId, preset.orderTypeId, preset.id);
    const includeInactive = options?.includeInactive ?? false;
    const conditions = [
      eq(orderFieldDefinitions.tenantId, tenantId),
      eq(orderFieldDefinitions.presetId, presetId),
      sql`${orderFieldDefinitions.deletedAt} IS NULL`,
    ];
    if (!includeInactive) conditions.push(eq(orderFieldDefinitions.isActive, true));

    const fields = await db
      .select()
      .from(orderFieldDefinitions)
      .where(and(...conditions))
      .orderBy(asc(orderFieldDefinitions.sortOrder), asc(orderFieldDefinitions.id));
    return { preset, fields: dedupeByFieldKey(fields) };
  },

  // Legacy: list fields by type code (uses ALL fields with presetId = null OR any preset of that type)
  async listFieldsByType(tenantId: number, code: string) {
    const typeRow = await getTypeOrThrow(tenantId, code);
    // Get the default preset for this type
    const [defaultPreset] = await db
      .select()
      .from(orderTypePresets)
      .where(
        and(
          eq(orderTypePresets.tenantId, tenantId),
          eq(orderTypePresets.orderTypeId, typeRow.id),
          eq(orderTypePresets.code, "default")
        )
      );

    if (defaultPreset?.id) {
      await ensureCanonicalNativeFieldsForPreset(tenantId, typeRow.id, defaultPreset.id);
    }

    // If we have a default preset, return its fields; otherwise fall back to unassigned fields
    const fields = await db
      .select()
      .from(orderFieldDefinitions)
      .where(
        and(
          eq(orderFieldDefinitions.tenantId, tenantId),
          eq(orderFieldDefinitions.orderTypeId, typeRow.id),
          sql`${orderFieldDefinitions.deletedAt} IS NULL`,
          defaultPreset
            ? eq(orderFieldDefinitions.presetId, defaultPreset.id)
            : isNull(orderFieldDefinitions.presetId),
          eq(orderFieldDefinitions.isActive, true)
        )
      )
      .orderBy(asc(orderFieldDefinitions.sortOrder), asc(orderFieldDefinitions.id));

    return { type: typeRow, fields, defaultPresetId: defaultPreset?.id ?? null };
  },

  async createField(
    tenantId: number,
    presetId: number,
    payload: {
      label: string;
      fieldType: string;
      required?: boolean;
      config?: unknown;
      fieldKey?: string;
      visibleInTracking?: boolean;
      useInAgenda?: boolean;
    }
  ) {
    const preset = await getPresetOrThrow(tenantId, presetId);
    const label = String(payload.label || "").trim();
    if (!label) throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "label es requerido");

    const fieldType = normalizeFieldTypeInput(payload.fieldType);
    const config = normalizeOrderPresetFieldConfig(fieldType, payload.config);
    if (fieldType === "FILE" && payload.required) {
      throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "Los archivos adjuntos no pueden marcarse como requeridos en el alta inicial");
    }

    const rawKey = payload.fieldKey ? slugifyFieldKey(payload.fieldKey) : slugifyFieldKey(label);
    const nativeKind = resolveNativeOrderFieldKind({ fieldKey: rawKey, label });
    if (nativeKind) {
      const existingNative = await findExistingNativeFieldForPreset(tenantId, presetId, nativeKind);
      if (existingNative) {
        throw new HttpError(409, "ORDER_PRESET_NATIVE_FIELD_EXISTS", `El campo base "${buildNativeOrderFieldTemplate(nativeKind).label}" ya existe en este preset`, {
          fieldId: existingNative.id,
          fieldKey: existingNative.fieldKey,
          nativeKind,
        });
      }
    }
    const fieldKey = await resolveUniqueFieldKey(tenantId, presetId, rawKey);

    const [maxSort] = await db
      .select({ sortOrder: orderFieldDefinitions.sortOrder })
      .from(orderFieldDefinitions)
      .where(
        and(
          eq(orderFieldDefinitions.tenantId, tenantId),
          eq(orderFieldDefinitions.presetId, presetId),
          sql`${orderFieldDefinitions.deletedAt} IS NULL`
        )
      )
      .orderBy(desc(orderFieldDefinitions.sortOrder), desc(orderFieldDefinitions.id))
      .limit(1);

    const values: InsertOrderFieldDefinition = {
      tenantId,
      orderTypeId: preset.orderTypeId,
      presetId,
      fieldKey,
      label,
      fieldType,
      required: Boolean(payload.required),
      sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      config,
      isActive: true,
      visibleInTracking: Boolean(payload.visibleInTracking),
      useInAgenda: Boolean(payload.useInAgenda),
      deletedAt: null,
    };

    const [created] = await db.insert(orderFieldDefinitions).values(values).returning();
    return { preset, field: created };
  },

  // Legacy createField by type code → routes to default preset
  async createFieldByTypeCode(
    tenantId: number,
    code: string,
    payload: {
      label: string;
      fieldType: string;
      required?: boolean;
      config?: unknown;
      fieldKey?: string;
      visibleInTracking?: boolean;
      useInAgenda?: boolean;
    }
  ) {
    const typeRow = await getTypeOrThrow(tenantId, code);
    // Upsert default preset for this type
    let [defaultPreset] = await db
      .select()
      .from(orderTypePresets)
      .where(
        and(
          eq(orderTypePresets.tenantId, tenantId),
          eq(orderTypePresets.orderTypeId, typeRow.id),
          eq(orderTypePresets.code, "default")
        )
      );
    if (!defaultPreset) {
      [defaultPreset] = await db
        .insert(orderTypePresets)
        .values({ tenantId, orderTypeId: typeRow.id, code: "default", label: "Default", isActive: true, sortOrder: 0 })
        .onConflictDoNothing()
        .returning();
    }
    return this.createField(tenantId, defaultPreset!.id, payload);
  },

  async updateField(
    tenantId: number,
    fieldId: number,
    patch: { label?: string; required?: boolean; config?: unknown; isActive?: boolean; visibleInTracking?: boolean; useInAgenda?: boolean }
  ) {
    const [current] = await db
      .select()
      .from(orderFieldDefinitions)
      .where(and(eq(orderFieldDefinitions.id, fieldId), eq(orderFieldDefinitions.tenantId, tenantId), sql`${orderFieldDefinitions.deletedAt} IS NULL`));
    if (!current) throw notFound("ORDER_FIELD_NOT_FOUND", "Campo no encontrado");

    const update: Partial<InsertOrderFieldDefinition> = {};
    if (patch.label !== undefined) {
      const label = String(patch.label || "").trim();
      if (!label) throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "label no puede ser vacío");
      const nextNativeKind = resolveNativeOrderFieldKind({ fieldKey: current.fieldKey, label });
      if (nextNativeKind) {
        const existingNative = await findExistingNativeFieldForPreset(tenantId, current.presetId!, nextNativeKind, current.id);
        if (existingNative) {
          throw new HttpError(409, "ORDER_PRESET_NATIVE_FIELD_EXISTS", `El campo base "${buildNativeOrderFieldTemplate(nextNativeKind).label}" ya existe en este preset`, {
            fieldId: existingNative.id,
            fieldKey: existingNative.fieldKey,
            nativeKind: nextNativeKind,
          });
        }
      }
      update.label = label;
    }
    if (patch.required !== undefined) {
      if (resolveOrderFieldDefinition(current).normalizedType === "FILE" && patch.required) {
        throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "Los archivos adjuntos no pueden marcarse como requeridos en el alta inicial");
      }
      update.required = Boolean(patch.required);
    }
    if (patch.isActive !== undefined) {
      update.isActive = Boolean(patch.isActive);
      if (!patch.isActive) {
        update.required = false;
        update.visibleInTracking = false;
        update.useInAgenda = false;
      }
    }
    if (patch.visibleInTracking !== undefined) update.visibleInTracking = Boolean(patch.visibleInTracking);
    if (patch.useInAgenda !== undefined) update.useInAgenda = Boolean(patch.useInAgenda);
    if (patch.config !== undefined)
      update.config = normalizeOrderPresetFieldConfig(current.fieldType as any, patch.config);

    const [saved] = await db
      .update(orderFieldDefinitions)
      .set(update)
      .where(and(eq(orderFieldDefinitions.id, fieldId), eq(orderFieldDefinitions.tenantId, tenantId)))
      .returning();

    return saved;
  },

  async reorderFields(tenantId: number, presetId: number, orderedFieldIds: number[]) {
    if (!Array.isArray(orderedFieldIds) || orderedFieldIds.length === 0) {
      throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "orderedFieldIds requerido");
    }
    const unique = new Set(orderedFieldIds);
    if (unique.size !== orderedFieldIds.length) {
      throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "orderedFieldIds no puede contener repetidos");
    }

    const preset = await getPresetOrThrow(tenantId, presetId);

    const fields = await db
      .select({ id: orderFieldDefinitions.id })
      .from(orderFieldDefinitions)
      .where(
        and(
          eq(orderFieldDefinitions.tenantId, tenantId),
          eq(orderFieldDefinitions.presetId, presetId),
          sql`${orderFieldDefinitions.deletedAt} IS NULL`,
          inArray(orderFieldDefinitions.id, orderedFieldIds)
        )
      );

    if (fields.length !== orderedFieldIds.length) {
      throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "Hay campos inválidos para este preset");
    }

    await db.transaction(async (tx) => {
      await Promise.all(
        orderedFieldIds.map((id, index) =>
          tx
            .update(orderFieldDefinitions)
            .set({ sortOrder: index })
            .where(
              and(
                eq(orderFieldDefinitions.id, id),
                eq(orderFieldDefinitions.tenantId, tenantId),
                eq(orderFieldDefinitions.presetId, presetId)
              )
            )
        )
      );
    });

    return this.listFieldsByPreset(tenantId, presetId);
  },

  // Legacy reorderFields by type code
  async reorderFieldsByTypeCode(tenantId: number, code: string, orderedFieldIds: number[]) {
    const { defaultPresetId } = await this.listFieldsByType(tenantId, code);
    if (!defaultPresetId) throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "No hay preset default");
    const result = await this.reorderFields(tenantId, defaultPresetId, orderedFieldIds);
    return { fields: result.fields, type: { code } };
  },

  async deactivateField(tenantId: number, fieldId: number) {
    const [saved] = await db
      .update(orderFieldDefinitions)
      .set({ isActive: false })
      .where(and(eq(orderFieldDefinitions.id, fieldId), eq(orderFieldDefinitions.tenantId, tenantId), sql`${orderFieldDefinitions.deletedAt} IS NULL`))
      .returning();

    if (!saved) throw notFound("ORDER_FIELD_NOT_FOUND", "Campo no encontrado");
    return saved;
  },

  async deleteField(tenantId: number, fieldId: number) {
    const [saved] = await db
      .update(orderFieldDefinitions)
      .set({
        deletedAt: new Date(),
        isActive: false,
        required: false,
        visibleInTracking: false,
      })
      .where(and(eq(orderFieldDefinitions.id, fieldId), eq(orderFieldDefinitions.tenantId, tenantId), sql`${orderFieldDefinitions.deletedAt} IS NULL`))
      .returning();

    if (!saved) throw notFound("ORDER_FIELD_NOT_FOUND", "Campo no encontrado");
    return saved;
  },

  // ── Backfill ─────────────────────────────────────────────────────────────
  /**
   * For each (tenant, order_type) combination that has fields without a preset_id,
   * create a "default" preset and assign those fields to it.
   * Idempotent: safe to call multiple times.
   */
  async backfillDefaultPresets() {
    // Find all (tenant_id, order_type_id) combos that have unassigned fields
    const unassigned = await db
      .selectDistinct({
        tenantId: orderFieldDefinitions.tenantId,
        orderTypeId: orderFieldDefinitions.orderTypeId,
      })
      .from(orderFieldDefinitions)
      .where(isNull(orderFieldDefinitions.presetId));

    for (const { tenantId, orderTypeId } of unassigned) {
      // Upsert default preset for this type
      await db
        .insert(orderTypePresets)
        .values({
          tenantId,
          orderTypeId,
          code: "default",
          label: "Default",
          isActive: true,
          sortOrder: 0,
        })
        .onConflictDoNothing();

      const [defaultPreset] = await db
        .select()
        .from(orderTypePresets)
        .where(
          and(
            eq(orderTypePresets.tenantId, tenantId),
            eq(orderTypePresets.orderTypeId, orderTypeId),
            eq(orderTypePresets.code, "default")
          )
        );

      if (defaultPreset) {
        // Assign all unassigned fields of this type to the default preset
        await db
          .update(orderFieldDefinitions)
          .set({ presetId: defaultPreset.id })
          .where(
            and(
              eq(orderFieldDefinitions.tenantId, tenantId),
              eq(orderFieldDefinitions.orderTypeId, orderTypeId),
              isNull(orderFieldDefinitions.presetId)
            )
          );
      }
    }
  },
};
