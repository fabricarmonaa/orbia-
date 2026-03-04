export type FieldEntityType = "SALE" | "ORDER" | "PRODUCT";
export type FieldType = "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "MULTISELECT" | "MONEY" | "FILE";

export interface FieldDefinitionInput {
  fieldType: FieldType;
  config?: Record<string, unknown> | null;
}

export interface OptionListResolver {
  hasOptionListKey: (key: string) => Promise<boolean>;
}

export function normalizeFieldKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "campo";
}

export function normalizeOptionListKey(value: string) {
  return normalizeFieldKey(value);
}

function fail(message: string, meta?: Record<string, unknown>) {
  const error = new Error(message);
  (error as Error & { code?: string; meta?: Record<string, unknown> }).code = "FIELD_INVALID_CONFIG";
  (error as Error & { code?: string; meta?: Record<string, unknown> }).meta = meta;
  throw error;
}

export async function validateFieldDefinitionConfig(input: FieldDefinitionInput, resolver?: OptionListResolver) {
  const config = input.config && typeof input.config === "object" && !Array.isArray(input.config) ? { ...input.config } : {};
  if (input.fieldType === "SELECT" || input.fieldType === "MULTISELECT") {
    const optionListKey = config.optionListKey ? normalizeOptionListKey(String(config.optionListKey)) : "";
    const optionsInline = Array.isArray(config.optionsInline) ? config.optionsInline : [];
    if (!optionListKey && optionsInline.length === 0) {
      fail("Para campos de selección tenés que elegir una lista o cargar opciones inline.");
    }
    if (optionListKey && resolver) {
      const exists = await resolver.hasOptionListKey(optionListKey);
      if (!exists) fail("La lista desplegable seleccionada no existe.", { optionListKey });
    }
  }

  if (input.fieldType === "NUMBER") {
    const min = config.min != null ? Number(config.min) : null;
    const max = config.max != null ? Number(config.max) : null;
    if (min != null && max != null && min > max) fail("El mínimo no puede ser mayor al máximo.");
  }

  if (input.fieldType === "FILE") {
    const maxBytes = config.maxBytes != null ? Number(config.maxBytes) : 0;
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) fail("El tamaño máximo de archivo debe ser mayor a cero.");
  }

  return config;
}
