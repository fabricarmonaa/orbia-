import { resolveCreateOrderFieldLayout, type OrderFieldDefinitionLike } from "@shared/order-fields";

export type OrderPresetSummary = {
  id: number;
  code: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
};

export function pickNextPresetForSelection(
  presets: OrderPresetSummary[],
  currentPresetId?: number | null,
) {
  const available = presets
    .filter((preset) => preset.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  if (available.length === 0) return null;
  const current = available.find((preset) => preset.id === currentPresetId);
  if (current) return current;
  return available.find((preset) => preset.code === "default") || available[0];
}

export function resolveOrderCreateLayout<T extends OrderFieldDefinitionLike>(fields: T[]) {
  return resolveCreateOrderFieldLayout(fields);
}
