import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { orderFieldDefinitions, orderFieldValues, orderTypeDefinitions } from "@shared/schema";
import { badRequest, notFound } from "../lib/http-errors";

export type CustomFieldPayload = {
  fieldId?: number;
  fieldKey?: string;
  valueText?: string | null;
  valueNumber?: number | string | null;
  fileId?: string | number | null;
  fileStorageKey?: string | null;
  visibleOverride?: boolean | null;
};

const FILE_ALLOWED = new Set(["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"]);

function getExt(name: string) {
  const clean = String(name || "").trim().toLowerCase();
  const i = clean.lastIndexOf(".");
  if (i < 0) return "";
  return clean.slice(i + 1);
}

export async function resolveTypeOrThrow(tenantId: number, orderTypeCode: string) {
  const code = String(orderTypeCode || "").trim().toUpperCase();
  const [typeRow] = await db
    .select()
    .from(orderTypeDefinitions)
    .where(and(eq(orderTypeDefinitions.tenantId, tenantId), eq(orderTypeDefinitions.code, code)));
  if (!typeRow) throw notFound("ORDER_TYPE_NOT_FOUND", "Tipo de pedido no encontrado");
  return typeRow;
}

export async function validateAndNormalizeCustomFields(
  tenantId: number,
  orderTypeCode: string,
  customFields: CustomFieldPayload[],
  orderPresetId?: number | null
) {
  const typeRow = await resolveTypeOrThrow(tenantId, orderTypeCode);

  // Condición base: del tenant, del tipo, y activos
  const conditions = [
    eq(orderFieldDefinitions.tenantId, tenantId),
    eq(orderFieldDefinitions.orderTypeId, typeRow.id),
    eq(orderFieldDefinitions.isActive, true),
  ];

  // Si nos pasan un preset explicitamente, o estamos en el flujo legacy sin presets,
  // filtramos los defs esperados para evitar pedir "required" de OTROS presets.
  if (orderPresetId) {
    conditions.push(eq(orderFieldDefinitions.presetId, orderPresetId));
  } else {
    // Si la BD tiene presets, los que tienen presetId=NULL son los legacy o default compartidos
    // o tal vez si front no envía, queremos aceptar sin restricción pero esto es más seguro.
    // conditions.push(isNull(orderFieldDefinitions.presetId));
  }

  const defs = await db
    .select()
    .from(orderFieldDefinitions)
    .where(and(...conditions));

  const byId = new Map(defs.map((d) => [d.id, d]));
  const byKey = new Map(defs.map((d) => [d.fieldKey, d]));

  const normalized = customFields.map((row) => {
    const def = row.fieldId ? byId.get(Number(row.fieldId)) : (row.fieldKey ? byKey.get(String(row.fieldKey)) : undefined);
    if (!def) {
      throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "Campo personalizado inválido", { fieldId: row.fieldId ?? null, fieldKey: row.fieldKey ?? null });
    }

    let valueText: string | null = row.valueText != null ? String(row.valueText) : null;
    let valueNumber: string | null = row.valueNumber != null && row.valueNumber !== "" ? String(row.valueNumber) : null;
    let fileStorageKey: string | null = row.fileStorageKey != null && row.fileStorageKey !== "" ? String(row.fileStorageKey) : (row.fileId != null && row.fileId !== "" ? String(row.fileId) : null);

    if (def.fieldType === "TEXT") {
      valueNumber = null;
      fileStorageKey = null;
      if (def.required && !String(valueText || "").trim()) {
        throw badRequest("ORDER_PRESET_VALIDATION_ERROR", `Campo requerido: ${def.label}`, { fieldId: def.id, fieldKey: def.fieldKey, reason: "REQUIRED_TEXT" });
      }
    } else if (def.fieldType === "NUMBER") {
      valueText = null;
      fileStorageKey = null;
      if (valueNumber != null && Number.isNaN(Number(valueNumber))) {
        throw badRequest("ORDER_PRESET_VALIDATION_ERROR", `Número inválido en ${def.label}`, { fieldId: def.id, fieldKey: def.fieldKey, reason: "INVALID_NUMBER" });
      }
      if (def.required && (valueNumber == null || valueNumber === "")) {
        throw badRequest("ORDER_PRESET_VALIDATION_ERROR", `Campo requerido: ${def.label}`, { fieldId: def.id, fieldKey: def.fieldKey, reason: "REQUIRED_NUMBER" });
      }
    } else if (def.fieldType === "FILE") {
      valueText = null;
      valueNumber = null;
      const cfg = (def.config || {}) as { allowedExtensions?: string[] };
      const allowed = (cfg.allowedExtensions && cfg.allowedExtensions.length ? cfg.allowedExtensions : Array.from(FILE_ALLOWED)).map((x) => String(x).toLowerCase());
      if (def.required && !fileStorageKey) {
        throw badRequest("ORDER_PRESET_VALIDATION_ERROR", `Campo requerido: ${def.label}`, { fieldId: def.id, fieldKey: def.fieldKey, reason: "REQUIRED_FILE" });
      }
      if (fileStorageKey) {
        const ext = getExt(fileStorageKey);
        if (ext && !allowed.includes(ext) && !FILE_ALLOWED.has(ext)) {
          throw badRequest("ORDER_PRESET_VALIDATION_ERROR", `Extensión no permitida en ${def.label}`, { fieldId: def.id, fieldKey: def.fieldKey, reason: "INVALID_FILE_EXTENSION", fileStorageKey });
        }
      }
    }

    return {
      fieldDefinitionId: def.id,
      valueText,
      valueNumber,
      fileStorageKey,
      visibleOverride: row.visibleOverride !== undefined ? row.visibleOverride : null,
    };
  });

  const requiredMissing = defs.filter((d) => d.required && !normalized.some((n) => n.fieldDefinitionId === d.id));
  if (requiredMissing.length > 0) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", `Faltan campos requeridos: ${requiredMissing.map((r) => r.label).join(", ")}`, { missing: requiredMissing.map((r) => ({ fieldId: r.id, fieldKey: r.fieldKey })) });
  }

  return { typeRow, normalized, defs };
}

export async function saveCustomFieldValues(orderId: number, tenantId: number, normalized: Array<{ fieldDefinitionId: number; valueText: string | null; valueNumber: string | null; fileStorageKey: string | null; visibleOverride: boolean | null; }>) {
  for (const row of normalized) {
    const existing = await db
      .select({ id: orderFieldValues.id })
      .from(orderFieldValues)
      .where(and(eq(orderFieldValues.orderId, orderId), eq(orderFieldValues.fieldDefinitionId, row.fieldDefinitionId), eq(orderFieldValues.tenantId, tenantId)));

    if (existing.length > 0) {
      const updateData: any = { valueText: row.valueText, valueNumber: row.valueNumber, fileStorageKey: row.fileStorageKey };
      if (row.visibleOverride !== undefined && row.visibleOverride !== null) {
        updateData.visibleOverride = row.visibleOverride;
      }
      await db
        .update(orderFieldValues)
        .set(updateData)
        .where(eq(orderFieldValues.id, existing[0].id));
    } else {
      await db.insert(orderFieldValues).values({
        orderId,
        tenantId,
        fieldDefinitionId: row.fieldDefinitionId,
        valueText: row.valueText,
        valueNumber: row.valueNumber,
        fileStorageKey: row.fileStorageKey,
        visibleOverride: row.visibleOverride ?? null,
      });
    }
  }
}

export async function getOrderCustomFields(orderId: number, tenantId: number) {
  const values = await db
    .select()
    .from(orderFieldValues)
    .where(and(eq(orderFieldValues.orderId, orderId), eq(orderFieldValues.tenantId, tenantId)));
  if (values.length === 0) return [];
  const defIds = values.map((v) => v.fieldDefinitionId);
  const defs = await db
    .select()
    .from(orderFieldDefinitions)
    .where(and(eq(orderFieldDefinitions.tenantId, tenantId), inArray(orderFieldDefinitions.id, defIds)));
  const map = new Map(defs.map((d) => [d.id, d]));
  return values.map((v) => ({
    fieldId: v.fieldDefinitionId,
    fieldKey: map.get(v.fieldDefinitionId)?.fieldKey || null,
    label: map.get(v.fieldDefinitionId)?.label || null,
    fieldType: map.get(v.fieldDefinitionId)?.fieldType || null,
    required: map.get(v.fieldDefinitionId)?.required ?? false,
    visibleInTracking: map.get(v.fieldDefinitionId)?.visibleInTracking ?? false,
    valueText: v.valueText,
    valueNumber: v.valueNumber,
    fileStorageKey: v.fileStorageKey,
    visibleOverride: v.visibleOverride,
    config: map.get(v.fieldDefinitionId)?.config || null,
  }));
}
