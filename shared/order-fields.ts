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

export function normalizeSemanticKey(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const SEMANTIC_KIND_BY_KEY: Record<string, "customer" | "phone" | "description" | "paid" | "total"> = {
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

export function resolveNativeOrderFieldKind(def: Pick<OrderFieldDefinitionLike, "fieldKey" | "label">): "customer" | "phone" | "description" | "paid" | "total" | null {
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
  const normalizedType = String(field.fieldType || "").trim().toUpperCase();
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
