export const ORDER_FIELD_TYPES = [
  "TEXT",
  "TEXT_LONG",
  "NUMBER",
  "MONEY",
  "FILE",
  "CHECKBOX",
  "SELECT",
  "DATE",
  "TIME",
  "DATETIME",
] as const;

export type OrderFieldType = (typeof ORDER_FIELD_TYPES)[number];
export type NativeOrderFieldKind = "customer" | "phone" | "description" | "paid" | "total";

export type OrderFieldDefinitionLike = {
  id: number;
  presetId?: number | null;
  fieldKey?: string | null;
  label?: string | null;
  fieldType: string;
  required?: boolean | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
  visibleInTracking?: boolean | null;
  config?: Record<string, unknown> | unknown | null;
  deletedAt?: string | Date | null;
};

export type OrderFieldValueLike = {
  valueText?: string | null;
  valueNumber?: string | number | null;
  fileStorageKey?: string | null;
  visibleOverride?: boolean | null;
};

export type ResolvedOrderFieldDefinition<T extends OrderFieldDefinitionLike = OrderFieldDefinitionLike> = T & {
  normalizedType: OrderFieldType | string;
  semanticKey: string;
  visibleInForm: boolean;
  visibleInTracking: boolean;
  showWhenEmpty: boolean;
  placeholder: string;
  defaultValue: string | number | null;
  currencyCode: string;
  active: boolean;
  deleted: boolean;
};

export type OrderFieldSectionMeta = {
  key: string;
  label: string;
  sortOrder: number;
};

export type ResolvedOrderFieldLayoutSection<T extends OrderFieldDefinitionLike = OrderFieldDefinitionLike> = {
  key: string;
  label: string;
  sortOrder: number;
  fields: ResolvedOrderFieldDefinition<T>[];
};

export function normalizeSemanticKey(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const FIELD_TYPE_ALIASES: Record<string, OrderFieldType> = {
  CURRENCY: "MONEY",
  MONEDA: "MONEY",
  DINERO: "MONEY",
};

const SEMANTIC_KIND_BY_KEY: Record<string, NativeOrderFieldKind> = {
  cliente: "customer",
  customer: "customer",
  customer_name: "customer",
  nombre_cliente: "customer",
  telefono: "phone",
  telefono_cliente: "phone",
  customer_phone: "phone",
  phone: "phone",
  descripcion: "description",
  description: "description",
  detalle: "description",
  sena: "paid",
  sena_o_pago: "paid",
  senia: "paid",
  se_a: "paid",
  pago: "paid",
  paid_amount: "paid",
  pagado: "paid",
  valor_total: "total",
  total: "total",
  total_amount: "total",
  monto_total: "total",
};

export const NATIVE_ORDER_FIELD_KINDS = ["customer", "phone", "description", "paid", "total"] as const;

export function normalizeOrderFieldType(value: string): OrderFieldType | string {
  const normalized = String(value || "").trim().toUpperCase();
  if (FIELD_TYPE_ALIASES[normalized]) return FIELD_TYPE_ALIASES[normalized];
  return normalized;
}

export function resolveNativeOrderFieldKind(def: Pick<OrderFieldDefinitionLike, "fieldKey" | "label">): NativeOrderFieldKind | null {
  const candidates = [normalizeSemanticKey(def.fieldKey), normalizeSemanticKey(def.label)].filter(Boolean);
  for (const candidate of candidates) {
    if (SEMANTIC_KIND_BY_KEY[candidate]) return SEMANTIC_KIND_BY_KEY[candidate];
  }
  return null;
}

export function isNativeOrderField(def: Pick<OrderFieldDefinitionLike, "fieldKey" | "label">) {
  return resolveNativeOrderFieldKind(def) !== null;
}

export function resolveOrderFieldDefinition<T extends OrderFieldDefinitionLike>(field: T): ResolvedOrderFieldDefinition<T> {
  const config = (field.config || {}) as Record<string, unknown>;
  const normalizedType = normalizeOrderFieldType(field.fieldType);
  const visibleInForm = config.visibleInForm !== false;
  const visibleInTracking = field.visibleInTracking === true;
  const showWhenEmpty = config.showWhenEmpty === true;
  const placeholder = typeof config.placeholder === "string" ? config.placeholder : "";
  const defaultValue = config.defaultValue == null ? null : (config.defaultValue as string | number);
  const currencyCode = typeof config.currencyCode === "string" && config.currencyCode.trim() ? config.currencyCode.trim().toUpperCase() : "ARS";
  const active = field.isActive !== false;
  const deleted = Boolean(field.deletedAt);
  return {
    ...field,
    normalizedType,
    semanticKey: normalizeSemanticKey(field.fieldKey || field.label),
    visibleInForm,
    visibleInTracking,
    showWhenEmpty,
    placeholder,
    defaultValue,
    currencyCode,
    active,
    deleted,
  };
}

export function buildNativeOrderFieldTemplate(kind: NativeOrderFieldKind) {
  if (kind === "customer") {
    return {
      fieldKey: "customer_name",
      label: "Cliente",
      fieldType: "TEXT" as OrderFieldType,
      required: false,
      visibleInTracking: false,
      sortOrder: 0,
      config: { visibleInForm: true, placeholder: "Nombre del cliente" },
    };
  }
  if (kind === "phone") {
    return {
      fieldKey: "customer_phone",
      label: "Teléfono",
      fieldType: "TEXT" as OrderFieldType,
      required: false,
      visibleInTracking: false,
      sortOrder: 1,
      config: { visibleInForm: true, placeholder: "Teléfono del cliente" },
    };
  }
  if (kind === "description") {
    return {
      fieldKey: "description",
      label: "Descripción",
      fieldType: "TEXT_LONG" as OrderFieldType,
      required: false,
      visibleInTracking: false,
      sortOrder: 2,
      config: { visibleInForm: true, placeholder: "Detalle del pedido / encargo / turno / servicio" },
    };
  }
  if (kind === "paid") {
    return {
      fieldKey: "paid_amount",
      label: "Seña o Pago",
      fieldType: "MONEY" as OrderFieldType,
      required: false,
      visibleInTracking: false,
      sortOrder: 3,
      config: { visibleInForm: true, currencyCode: "ARS", placeholder: "Monto pagado" },
    };
  }
  return {
    fieldKey: "total_amount",
    label: "Valor Total",
    fieldType: "MONEY" as OrderFieldType,
    required: false,
    visibleInTracking: true,
    sortOrder: 4,
    config: { visibleInForm: true, currencyCode: "ARS", placeholder: "Monto total" },
  };
}

export function resolveRenderableOrderFields<T extends OrderFieldDefinitionLike>(fields: T[]) {
  return fields
    .map(resolveOrderFieldDefinition)
    .filter((field) => field.active && !field.deleted && field.visibleInForm)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.id - b.id);
}

export function resolveRenderableOrderFieldsForPreset<T extends OrderFieldDefinitionLike>(fields: T[], presetId?: number | null) {
  return resolveRenderableOrderFields(
    fields.filter((field) => presetId == null || field.presetId == null || field.presetId === presetId)
  );
}

function normalizeSectionLabel(value: unknown) {
  const label = String(value || "").trim();
  return label || "General";
}

export function resolveOrderFieldSectionMeta<T extends OrderFieldDefinitionLike>(field: T): OrderFieldSectionMeta {
  const config = (field.config || {}) as Record<string, unknown>;
  const label = normalizeSectionLabel(
    config.sectionLabel
      ?? config.sectionName
      ?? config.groupLabel
      ?? config.groupName
  );
  const key = normalizeSemanticKey(
    config.sectionKey
      ?? config.groupKey
      ?? label
  ) || "general";
  const sortOrder = Number(
    config.sectionOrder
      ?? config.groupOrder
      ?? 999
  );

  return {
    key,
    label,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 999,
  };
}

export function resolveCreateOrderFieldLayout<T extends OrderFieldDefinitionLike>(fields: T[]) {
  const renderable = resolveRenderableOrderFields(fields);
  const baseFields = renderable.filter((field) => isNativeOrderField(field));
  const customFields = renderable.filter((field) => !isNativeOrderField(field));
  const sectionsMap = new Map<string, ResolvedOrderFieldLayoutSection<T>>();

  for (const field of customFields) {
    const meta = resolveOrderFieldSectionMeta(field);
    const current = sectionsMap.get(meta.key);
    if (!current) {
      sectionsMap.set(meta.key, {
        key: meta.key,
        label: meta.label,
        sortOrder: meta.sortOrder,
        fields: [field],
      });
      continue;
    }
    current.fields.push(field);
    if (meta.sortOrder < current.sortOrder) current.sortOrder = meta.sortOrder;
    if (current.label === "General" && meta.label !== "General") current.label = meta.label;
  }

  const customSections = Array.from(sectionsMap.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "es-AR") || a.key.localeCompare(b.key, "es-AR")
  );

  return {
    renderable,
    baseFields,
    customFields,
    customSections,
  };
}

export function isOrderFieldValueFilled(
  fieldType: string,
  value: Pick<OrderFieldValueLike, "valueText" | "valueNumber" | "fileStorageKey">,
) {
  const normalizedType = String(fieldType || "").trim().toUpperCase();
  if (normalizedType === "FILE") return Boolean(String(value.fileStorageKey || "").trim());
  if (normalizedType === "NUMBER" || normalizedType === "MONEY") {
    return value.valueNumber !== null && value.valueNumber !== undefined && String(value.valueNumber).trim() !== "";
  }
  if (normalizedType === "CHECKBOX") {
    const normalized = String(value.valueText || "").trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "si" || normalized.split(",").filter(Boolean).length > 0;
  }
  return Boolean(String(value.valueText || "").trim());
}

export function shouldDisplayOrderFieldInTracking(
  field: OrderFieldDefinitionLike,
  value: OrderFieldValueLike,
) {
  const resolved = resolveOrderFieldDefinition(field);
  if (!resolved.active || resolved.deleted) return false;
  const visible = value.visibleOverride === true || (value.visibleOverride !== false && resolved.visibleInTracking);
  if (!visible) return false;
  if (resolved.showWhenEmpty) return true;
  return isOrderFieldValueFilled(resolved.normalizedType, value);
}

export function formatMoneyValue(
  value: string | number | null | undefined,
  currencyCode = "ARS",
  locale = "es-AR",
) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return String(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}
