export function buildReorderSortOrder(orderedFieldIds: number[]) {
  const unique = new Set(orderedFieldIds);
  if (unique.size !== orderedFieldIds.length) {
    const error = new Error("Hay IDs repetidos en el reordenamiento.");
    (error as Error & { code?: string }).code = "FIELD_REORDER_INVALID";
    throw error;
  }
  return orderedFieldIds.map((fieldId, index) => ({ fieldId, sortOrder: index }));
}

export function buildCashImpactReference(entity: "sale" | "order", entityId: number, fieldKey: string) {
  return `${entity}:${entityId}:field:${fieldKey}`;
}
