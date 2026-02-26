import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  orderFieldDefinitions,
  orderTypeDefinitions,
  orderTypePresets,
  type InsertOrderFieldDefinition,
  type InsertOrderTypePreset,
} from "@shared/schema";
import { db } from "../db";
import { badRequest, notFound, HttpError } from "../lib/http-errors";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const ALLOWED_FIELD_TYPES = new Set(["TEXT", "NUMBER", "FILE"] as const);
const ALLOWED_FILE_EXTENSIONS = ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"] as const;
const MAX_PRESETS_PER_TYPE = 3;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function sanitizeExtension(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
}

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

function normalizeFieldType(value: string): "TEXT" | "NUMBER" | "FILE" {
  const normalized = String(value || "").trim().toUpperCase();
  if (!ALLOWED_FIELD_TYPES.has(normalized as any)) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "fieldType inválido");
  }
  return normalized as "TEXT" | "NUMBER" | "FILE";
}

function normalizeConfig(fieldType: "TEXT" | "NUMBER" | "FILE", config: unknown): Record<string, unknown> {
  const base =
    config && typeof config === "object" && !Array.isArray(config)
      ? { ...(config as Record<string, unknown>) }
      : {};

  if (fieldType !== "FILE") return base;

  const raw = (base.allowedExtensions ?? ALLOWED_FILE_EXTENSIONS) as unknown;
  if (!Array.isArray(raw)) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "allowedExtensions debe ser array");
  }

  const normalized = Array.from(
    new Set(raw.map((x) => sanitizeExtension(String(x))).filter(Boolean))
  );
  if (normalized.length === 0) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "allowedExtensions no puede estar vacío");
  }

  const invalid = normalized.filter((ext) => !ALLOWED_FILE_EXTENSIONS.includes(ext as any));
  if (invalid.length > 0) {
    throw badRequest(
      "ORDER_PRESET_VALIDATION_ERROR",
      `Extensiones no permitidas: ${invalid.join(", ")}`,
      { allowed: ALLOWED_FILE_EXTENSIONS }
    );
  }

  base.allowedExtensions = normalized;
  return base;
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
    const labels: Record<string, string> = { PEDIDO: "Pedido", ENCARGO: "Encargo", TURNO: "Turno", SERVICIO: "Servicio" };
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
        eq(orderFieldDefinitions.fieldKey, desired)
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
          eq(orderFieldDefinitions.fieldKey, candidate)
        )
      );
    if (!row) return candidate;
  }

  throw new HttpError(409, "ORDER_FIELD_KEY_CONFLICT", "No se pudo generar un field_key único");
}

// ─────────────────────────────────────────────
// Storage API
// ─────────────────────────────────────────────
export const orderPresetsStorage = {
  // ── Types ────────────────────────────────────────────────────────────────
  async listOrderTypes(tenantId: number) {
    return db
      .select()
      .from(orderTypeDefinitions)
      .where(eq(orderTypeDefinitions.tenantId, tenantId))
      .orderBy(asc(orderTypeDefinitions.id));
  },

  // ── Presets ──────────────────────────────────────────────────────────────
  async listPresetsByType(tenantId: number, code: string) {
    const typeRow = await getTypeOrThrow(tenantId, code);
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
    if (patch.isActive !== undefined) update.isActive = Boolean(patch.isActive);
    if (patch.sortOrder !== undefined) update.sortOrder = Number(patch.sortOrder);

    const [saved] = await db
      .update(orderTypePresets)
      .set(update)
      .where(and(eq(orderTypePresets.id, presetId), eq(orderTypePresets.tenantId, tenantId)))
      .returning();
    return saved;
  },

  // ── Fields by preset ─────────────────────────────────────────────────────
  async listFieldsByPreset(tenantId: number, presetId: number) {
    const preset = await getPresetOrThrow(tenantId, presetId);
    const fields = await db
      .select()
      .from(orderFieldDefinitions)
      .where(
        and(
          eq(orderFieldDefinitions.tenantId, tenantId),
          eq(orderFieldDefinitions.presetId, presetId),
          eq(orderFieldDefinitions.isActive, true)
        )
      )
      .orderBy(asc(orderFieldDefinitions.sortOrder), asc(orderFieldDefinitions.id));
    return { preset, fields };
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

    // If we have a default preset, return its fields; otherwise fall back to unassigned fields
    const fields = await db
      .select()
      .from(orderFieldDefinitions)
      .where(
        and(
          eq(orderFieldDefinitions.tenantId, tenantId),
          eq(orderFieldDefinitions.orderTypeId, typeRow.id),
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
    }
  ) {
    const preset = await getPresetOrThrow(tenantId, presetId);
    const label = String(payload.label || "").trim();
    if (!label) throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "label es requerido");

    const fieldType = normalizeFieldType(payload.fieldType);
    const config = normalizeConfig(fieldType, payload.config);

    const rawKey = payload.fieldKey ? slugifyFieldKey(payload.fieldKey) : slugifyFieldKey(label);
    const fieldKey = await resolveUniqueFieldKey(tenantId, presetId, rawKey);

    const [maxSort] = await db
      .select({ sortOrder: orderFieldDefinitions.sortOrder })
      .from(orderFieldDefinitions)
      .where(
        and(
          eq(orderFieldDefinitions.tenantId, tenantId),
          eq(orderFieldDefinitions.presetId, presetId)
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
    patch: { label?: string; required?: boolean; config?: unknown; isActive?: boolean; visibleInTracking?: boolean }
  ) {
    const [current] = await db
      .select()
      .from(orderFieldDefinitions)
      .where(and(eq(orderFieldDefinitions.id, fieldId), eq(orderFieldDefinitions.tenantId, tenantId)));
    if (!current) throw notFound("ORDER_FIELD_NOT_FOUND", "Campo no encontrado");

    const update: Partial<InsertOrderFieldDefinition> = {};
    if (patch.label !== undefined) {
      const label = String(patch.label || "").trim();
      if (!label) throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "label no puede ser vacío");
      update.label = label;
    }
    if (patch.required !== undefined) update.required = Boolean(patch.required);
    if (patch.isActive !== undefined) update.isActive = Boolean(patch.isActive);
    if (patch.visibleInTracking !== undefined) update.visibleInTracking = Boolean(patch.visibleInTracking);
    if (patch.config !== undefined)
      update.config = normalizeConfig(current.fieldType as any, patch.config);

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
      .where(and(eq(orderFieldDefinitions.id, fieldId), eq(orderFieldDefinitions.tenantId, tenantId)))
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

export const ORDER_PRESET_ALLOWED_FILE_EXTENSIONS = ALLOWED_FILE_EXTENSIONS;
