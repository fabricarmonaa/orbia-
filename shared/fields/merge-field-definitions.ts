export type MergeableFieldType = "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "MULTISELECT" | "MONEY" | "FILE";

export type MergeableFieldDefinition = {
  id: number;
  fieldKey: string;
  label: string;
  fieldType: MergeableFieldType;
  required: boolean;
  sortOrder: number;
  config?: Record<string, unknown> | null;
  isActive?: boolean;
  visibleInTracking?: boolean;
};

export type ExistingFieldValue = {
  fieldKey: string;
  valueText?: string | null;
  valueNumber?: string | number | null;
  valueBool?: boolean | null;
  valueDate?: string | null;
  valueJson?: unknown;
  valueMoneyAmount?: string | number | null;
  fileStorageKey?: string | null;
};

export type FieldMergeWarning = {
  code: "FIELD_CONFLICT_CANONICAL" | "FIELD_INVALID_CONFIG" | "FIELD_VALUE_INCOMPATIBLE";
  fieldKey: string;
  message: string;
  blocking?: boolean;
};

export type MergedFieldDefinition = MergeableFieldDefinition;

export type MergeFieldDefinitionsResult = {
  mergedFields: MergedFieldDefinition[];
  warnings: FieldMergeWarning[];
  incompatibleValueKeys: string[];
};

/**
 * Canon ETAPA 11.4:
 * - field_definitions manda en tipo/config/validaciones.
 * - preset solo puede aportar orden y flags UI.
 * - required final: global.required || preset.required.
 * - visibleInTracking final: global.visibleInTracking && preset.visibleInTracking (si ambos existen).
 */
export function mergeFieldDefinitions(params: {
  presetFields: MergeableFieldDefinition[];
  globalFields: MergeableFieldDefinition[];
  existingValues?: ExistingFieldValue[];
}): MergeFieldDefinitionsResult {
  const warnings: FieldMergeWarning[] = [];
  const byKey = new Map<string, MergedFieldDefinition>();

  for (const preset of params.presetFields || []) {
    byKey.set(preset.fieldKey, { ...preset, config: preset.config || {} });
  }

  for (const global of params.globalFields || []) {
    const preset = byKey.get(global.fieldKey);
    if (!preset) {
      byKey.set(global.fieldKey, { ...global, config: global.config || {} });
      continue;
    }

    const configChanged = JSON.stringify(preset.config || {}) !== JSON.stringify(global.config || {});
    if (preset.fieldType !== global.fieldType || configChanged) {
      warnings.push({
        code: "FIELD_CONFLICT_CANONICAL",
        fieldKey: global.fieldKey,
        message: `El preset intenta redefinir '${global.fieldKey}'. Se usa la definición canónica.`,
      });
    }

    const mergedVisible =
      typeof global.visibleInTracking === "boolean" && typeof preset.visibleInTracking === "boolean"
        ? global.visibleInTracking && preset.visibleInTracking
        : (global.visibleInTracking ?? preset.visibleInTracking);

    byKey.set(global.fieldKey, {
      ...global,
      sortOrder: preset.sortOrder ?? global.sortOrder,
      required: Boolean(global.required || preset.required),
      visibleInTracking: mergedVisible,
      config: global.config || {},
    });
  }

  const mergedFields = Array.from(byKey.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const field of mergedFields) {
    if ((field.fieldType === "SELECT" || field.fieldType === "MULTISELECT") && !hasOptionsConfig(field.config)) {
      warnings.push({
        code: "FIELD_INVALID_CONFIG",
        fieldKey: field.fieldKey,
        message: `El campo '${field.label}' no tiene una lista de opciones válida.`,
        blocking: true,
      });
    }
  }

  const existing = params.existingValues || [];
  const incompatibleValueKeys: string[] = [];
  for (const value of existing) {
    const field = byKey.get(value.fieldKey);
    if (!field) continue;
    if (!isCompatibleValue(field.fieldType, value)) {
      incompatibleValueKeys.push(value.fieldKey);
      warnings.push({
        code: "FIELD_VALUE_INCOMPATIBLE",
        fieldKey: value.fieldKey,
        message: `El valor guardado de '${field.label}' es incompatible con el tipo actual. Reingresalo.`,
      });
    }
  }

  return { mergedFields, warnings, incompatibleValueKeys };
}

function hasOptionsConfig(config: Record<string, unknown> | null | undefined) {
  const safeConfig = config || {};
  const optionListKey = typeof safeConfig.optionListKey === "string" ? safeConfig.optionListKey.trim() : "";
  const optionsInline = Array.isArray(safeConfig.optionsInline) ? safeConfig.optionsInline : [];
  const options = Array.isArray(safeConfig.options) ? safeConfig.options : [];
  return optionListKey.length > 0 || optionsInline.length > 0 || options.length > 0;
}

function isCompatibleValue(fieldType: MergeableFieldType, value: ExistingFieldValue) {
  if (fieldType === "NUMBER") return value.valueNumber == null || `${value.valueNumber}`.trim() === "" || Number.isFinite(Number(value.valueNumber));
  if (fieldType === "MONEY") return value.valueMoneyAmount == null || `${value.valueMoneyAmount}`.trim() === "" || Number.isFinite(Number(value.valueMoneyAmount));
  if (fieldType === "BOOLEAN") return value.valueBool == null || typeof value.valueBool === "boolean";
  if (fieldType === "DATE") return value.valueDate == null || /^\d{4}-\d{2}-\d{2}$/.test(String(value.valueDate));
  if (fieldType === "FILE") return value.fileStorageKey == null || String(value.fileStorageKey).startsWith("att:");
  return true;
}
