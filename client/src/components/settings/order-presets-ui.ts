export type OrderPresetSummary = {
  id: number;
  code: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
};

export const MAX_ACTIVE_ORDER_PRESETS_PER_TYPE = 5;

export function getActiveOrderPresets<T extends OrderPresetSummary>(presets: T[]) {
  return [...presets]
    .filter((preset) => preset.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export function pickVisibleTrackingDefault(value?: boolean | null) {
  return value ?? true;
}

export function canCreateMoreOrderPresets<T extends OrderPresetSummary>(presets: T[]) {
  return getActiveOrderPresets(presets).length < MAX_ACTIVE_ORDER_PRESETS_PER_TYPE;
}

export function buildPresetDeleteRequest(presetId: number) {
  return {
    method: "DELETE" as const,
    url: `/api/order-presets/presets/${presetId}`,
  };
}

export function buildPresetListRequest(code: string, nonce: number | string = Date.now()) {
  return `/api/order-presets/types/${encodeURIComponent(code)}/presets?_=${encodeURIComponent(String(nonce))}`;
}

export function buildPresetFieldsRequest(presetId: number, options?: { includeInactive?: boolean; nonce?: number | string }) {
  const params = new URLSearchParams();
  if (options?.includeInactive) params.set("includeInactive", "1");
  params.set("_", String(options?.nonce ?? Date.now()));
  return `/api/order-presets/presets/${presetId}/fields?${params.toString()}`;
}

export function getEmptyOrderPresetFieldForm() {
  return {
    label: "",
    fieldType: "TEXT" as "TEXT" | "TEXT_LONG" | "NUMBER" | "MONEY" | "FILE" | "CHECKBOX" | "SELECT" | "DATE" | "TIME" | "DATETIME",
    required: false,
    visibleInTracking: true,
    useInAgenda: false,
    placeholder: "",
    defaultValue: "",
    currencyCode: "ARS",
    allowedExtensions: ["pdf", "jpg", "png", "jpeg"] as string[],
    mediaMode: "single" as "single" | "gallery" | "attachments",
    acceptMode: "mixed" as "images" | "mixed",
    maxFiles: "1",
    expectedFiles: "",
    trackingRender: "list" as "grid" | "carousel" | "list",
    selectOptions: [""] as string[],
    sectionLabel: "",
    sectionOrder: "",
  };
}
