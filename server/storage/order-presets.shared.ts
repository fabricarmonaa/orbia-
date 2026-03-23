import { ORDER_FIELD_TYPES, normalizeOrderFieldType } from "@shared/order-fields";
import { badRequest } from "../lib/http-errors";

const ALLOWED_FIELD_TYPES = new Set(ORDER_FIELD_TYPES);
export const ORDER_PRESET_ALLOWED_FILE_EXTENSIONS = ["pdf", "docx", "xlsx", "jpg", "png", "jpeg", "jfif"] as const;

function sanitizeExtension(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
}

function normalizeGenericConfig(base: Record<string, unknown>) {
  if (base.placeholder !== undefined && typeof base.placeholder !== "string") {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "placeholder debe ser texto");
  }
  if (base.defaultValue !== undefined && typeof base.defaultValue !== "string" && typeof base.defaultValue !== "number" && base.defaultValue !== null) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "defaultValue inválido");
  }
  if (base.visibleInForm !== undefined) base.visibleInForm = base.visibleInForm !== false;
  if (base.showWhenEmpty !== undefined) base.showWhenEmpty = base.showWhenEmpty === true;
  return base;
}

export function normalizeFieldTypeInput(value: string): "TEXT" | "TEXT_LONG" | "NUMBER" | "MONEY" | "FILE" | "CHECKBOX" | "SELECT" | "DATE" | "TIME" | "DATETIME" {
  const normalized = normalizeOrderFieldType(value);
  if (!ALLOWED_FIELD_TYPES.has(normalized as any)) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "fieldType inválido");
  }
  return normalized as any;
}

export function normalizeOrderPresetFieldConfig(fieldType: "TEXT" | "TEXT_LONG" | "NUMBER" | "MONEY" | "FILE" | "CHECKBOX" | "SELECT" | "DATE" | "TIME" | "DATETIME", config: unknown): Record<string, unknown> {
  const base =
    config && typeof config === "object" && !Array.isArray(config)
      ? { ...(config as Record<string, unknown>) }
      : {};
  normalizeGenericConfig(base);

  if (fieldType === "SELECT" || fieldType === "CHECKBOX") {
    const source = (base as any).options;
    const rawOptions = Array.isArray(source)
      ? source
      : (typeof source === "string" ? source.split(",") : []);
    const options = Array.from(new Set(rawOptions.map((x: unknown) => String(x || "").trim()).filter(Boolean))).slice(0, 100);
    if (fieldType === "SELECT" && options.length === 0) throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "El campo desplegable requiere opciones");
    if (options.length > 0) base.options = options;
    else delete (base as any).options;
    return base;
  }

  if (fieldType === "MONEY") {
    const currencyCode = typeof base.currencyCode === "string" && base.currencyCode.trim()
      ? base.currencyCode.trim().toUpperCase()
      : "ARS";
    base.currencyCode = currencyCode;
    if (base.defaultValue !== undefined && base.defaultValue !== null && base.defaultValue !== "") {
      const parsed = Number(base.defaultValue);
      if (Number.isNaN(parsed)) {
        throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "defaultValue debe ser numérico para dinero");
      }
      base.defaultValue = parsed;
    }
    return base;
  }

  if (fieldType === "NUMBER") {
    if (base.defaultValue !== undefined && base.defaultValue !== null && base.defaultValue !== "") {
      const parsed = Number(base.defaultValue);
      if (Number.isNaN(parsed)) {
        throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "defaultValue debe ser numérico");
      }
      base.defaultValue = parsed;
    }
    return base;
  }

  if (fieldType !== "FILE") return base;

  const raw = (base.allowedExtensions ?? ORDER_PRESET_ALLOWED_FILE_EXTENSIONS) as unknown;
  if (!Array.isArray(raw)) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "allowedExtensions debe ser array");
  }

  const normalized = Array.from(
    new Set(raw.map((x) => sanitizeExtension(String(x))).filter(Boolean))
  );
  if (normalized.length === 0) {
    throw badRequest("ORDER_PRESET_VALIDATION_ERROR", "allowedExtensions no puede estar vacío");
  }

  const invalid = normalized.filter((ext) => !ORDER_PRESET_ALLOWED_FILE_EXTENSIONS.includes(ext as any));
  if (invalid.length > 0) {
    throw badRequest(
      "ORDER_PRESET_VALIDATION_ERROR",
      `Extensiones no permitidas: ${invalid.join(", ")}`,
      { allowed: ORDER_PRESET_ALLOWED_FILE_EXTENSIONS }
    );
  }

  base.allowedExtensions = normalized;
  return base;
}

export function buildCanonicalNativeFieldUpdate(
  current: { isActive?: boolean | null; deletedAt?: Date | string | null },
  template: { fieldKey: string; label: string; fieldType: string; sortOrder: number; visibleInTracking: boolean },
  mergedConfig: Record<string, unknown>,
) {
  return {
    fieldKey: template.fieldKey,
    label: template.label,
    fieldType: template.fieldType,
    sortOrder: template.sortOrder,
    config: mergedConfig,
    isSystemDefault: true,
    isActive: current.isActive ?? true,
    deletedAt: current.deletedAt ?? null,
    visibleInTracking: template.visibleInTracking,
  };
}
