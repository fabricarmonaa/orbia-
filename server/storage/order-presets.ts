import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  orderFieldDefinitions,
  orderTypeDefinitions,
  type InsertOrderFieldDefinition,
} from "@shared/schema";
import { db } from "../db";
import { badRequest, notFound, HttpError } from "../lib/http-errors";

const ALLOWED_FIELD_TYPES = new Set(["TEXT", "NUMBER", "FILE"] as const);
const ALLOWED_FILE_EXTENSIONS = ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"] as const;

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

function normalizeFieldType(value: string): "TEXT" | "NUMBER" | "FILE" {
  const normalized = String(value || "").trim().toUpperCase();
  if (!ALLOWED_FIELD_TYPES.has(normalized as any)) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "fieldType inválido");
  }
  return normalized as "TEXT" | "NUMBER" | "FILE";
}

function normalizeConfig(fieldType: "TEXT" | "NUMBER" | "FILE", config: unknown): Record<string, unknown> {
  const base = config && typeof config === "object" && !Array.isArray(config) ? { ...(config as Record<string, unknown>) } : {};

  if (fieldType !== "FILE") return base;

  const raw = (base.allowedExtensions ?? ALLOWED_FILE_EXTENSIONS) as unknown;
  if (!Array.isArray(raw)) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "allowedExtensions debe ser array");
  }

  const normalized = Array.from(new Set(raw.map((x) => sanitizeExtension(String(x))).filter(Boolean)));
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
  const [typeRow] = await db
    .select()
    .from(orderTypeDefinitions)
    .where(and(eq(orderTypeDefinitions.tenantId, tenantId), eq(orderTypeDefinitions.code, normalizedCode)));

  if (!typeRow) {
    throw notFound("ORDER_TYPE_NOT_FOUND", "Tipo de pedido no encontrado");
  }

  return typeRow;
}

async function resolveUniqueFieldKey(tenantId: number, orderTypeId: number, desired: string): Promise<string> {
  const [existing] = await db
    .select({ id: orderFieldDefinitions.id })
    .from(orderFieldDefinitions)
    .where(and(eq(orderFieldDefinitions.tenantId, tenantId), eq(orderFieldDefinitions.orderTypeId, orderTypeId), eq(orderFieldDefinitions.fieldKey, desired)));
  if (!existing) return desired;

  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const candidate = `${desired}-${suffix}`.slice(0, 80);
    const [row] = await db
      .select({ id: orderFieldDefinitions.id })
      .from(orderFieldDefinitions)
      .where(and(eq(orderFieldDefinitions.tenantId, tenantId), eq(orderFieldDefinitions.orderTypeId, orderTypeId), eq(orderFieldDefinitions.fieldKey, candidate)));
    if (!row) return candidate;
  }

  throw new HttpError(409, "ORDER_FIELD_KEY_CONFLICT", "No se pudo generar un field_key único");
}

export const orderPresetsStorage = {
  async listOrderTypes(tenantId: number) {
    return db
      .select()
      .from(orderTypeDefinitions)
      .where(eq(orderTypeDefinitions.tenantId, tenantId))
      .orderBy(asc(orderTypeDefinitions.id));
  },

  async listFieldsByType(tenantId: number, code: string) {
    const typeRow = await getTypeOrThrow(tenantId, code);
    const fields = await db
      .select()
      .from(orderFieldDefinitions)
      .where(
        and(
          eq(orderFieldDefinitions.tenantId, tenantId),
          eq(orderFieldDefinitions.orderTypeId, typeRow.id),
          eq(orderFieldDefinitions.isActive, true)
        )
      )
      .orderBy(asc(orderFieldDefinitions.sortOrder), asc(orderFieldDefinitions.id));

    return { type: typeRow, fields };
  },

  async createField(
    tenantId: number,
    code: string,
    payload: {
      label: string;
      fieldType: string;
      required?: boolean;
      config?: unknown;
      fieldKey?: string;
    }
  ) {
    const typeRow = await getTypeOrThrow(tenantId, code);
    const label = String(payload.label || "").trim();
    if (!label) throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "label es requerido");

    const fieldType = normalizeFieldType(payload.fieldType);
    const config = normalizeConfig(fieldType, payload.config);

    const rawKey = payload.fieldKey ? slugifyFieldKey(payload.fieldKey) : slugifyFieldKey(label);
    const fieldKey = await resolveUniqueFieldKey(tenantId, typeRow.id, rawKey);

    const [maxSort] = await db
      .select({ sortOrder: orderFieldDefinitions.sortOrder })
      .from(orderFieldDefinitions)
      .where(and(eq(orderFieldDefinitions.tenantId, tenantId), eq(orderFieldDefinitions.orderTypeId, typeRow.id)))
      .orderBy(desc(orderFieldDefinitions.sortOrder), desc(orderFieldDefinitions.id))
      .limit(1);

    const values: InsertOrderFieldDefinition = {
      tenantId,
      orderTypeId: typeRow.id,
      fieldKey,
      label,
      fieldType,
      required: Boolean(payload.required),
      sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      config,
      isActive: true,
    };

    const [created] = await db.insert(orderFieldDefinitions).values(values).returning();
    return { type: typeRow, field: created };
  },

  async updateField(
    tenantId: number,
    fieldId: number,
    patch: { label?: string; required?: boolean; config?: unknown; isActive?: boolean }
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
    if (patch.config !== undefined) update.config = normalizeConfig(current.fieldType as any, patch.config);

    const [saved] = await db
      .update(orderFieldDefinitions)
      .set(update)
      .where(and(eq(orderFieldDefinitions.id, fieldId), eq(orderFieldDefinitions.tenantId, tenantId)))
      .returning();

    return saved;
  },

  async reorderFields(tenantId: number, code: string, orderedFieldIds: number[]) {
    if (!Array.isArray(orderedFieldIds) || orderedFieldIds.length === 0) {
      throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "orderedFieldIds requerido");
    }

    const unique = new Set(orderedFieldIds);
    if (unique.size !== orderedFieldIds.length) {
      throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "orderedFieldIds no puede contener repetidos");
    }

    const typeRow = await getTypeOrThrow(tenantId, code);
    const fields = await db
      .select({ id: orderFieldDefinitions.id })
      .from(orderFieldDefinitions)
      .where(
        and(
          eq(orderFieldDefinitions.tenantId, tenantId),
          eq(orderFieldDefinitions.orderTypeId, typeRow.id),
          inArray(orderFieldDefinitions.id, orderedFieldIds)
        )
      );

    if (fields.length !== orderedFieldIds.length) {
      throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "Hay campos inválidos para este tipo");
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
                eq(orderFieldDefinitions.orderTypeId, typeRow.id)
              )
            )
        )
      );
    });

    return this.listFieldsByType(tenantId, code);
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
};

export const ORDER_PRESET_ALLOWED_FILE_EXTENSIONS = ALLOWED_FILE_EXTENSIONS;
