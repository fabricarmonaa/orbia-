export interface RawFieldValueInput {
  valueText?: string | null;
  valueNumber?: string | number | null;
  valueBool?: boolean | null;
  valueDate?: string | null;
  valueJson?: unknown;
  valueMoneyAmount?: string | number | null;
  valueMoneyDirection?: number | null;
  currency?: string | null;
  fileStorageKey?: string | null;
}

export function normalizeTypedFieldValue(row: RawFieldValueInput) {
  return {
    valueText: row.valueText ?? null,
    valueNumber: row.valueNumber != null && row.valueNumber !== "" ? String(row.valueNumber) : null,
    valueBool: row.valueBool ?? null,
    valueDate: row.valueDate ?? null,
    valueJson: row.valueJson ?? null,
    valueMoneyAmount: row.valueMoneyAmount != null && row.valueMoneyAmount !== "" ? String(row.valueMoneyAmount) : null,
    valueMoneyDirection: row.valueMoneyDirection ?? null,
    currency: row.currency ? String(row.currency).toUpperCase() : null,
    fileStorageKey: row.fileStorageKey ?? null,
    updatedAt: new Date(),
  };
}
