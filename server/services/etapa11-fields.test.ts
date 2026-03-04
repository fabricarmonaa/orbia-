import test from "node:test";
import assert from "node:assert/strict";
import { validateFieldDefinitionConfig } from "@shared/validators/fields";
import { normalizeTypedFieldValue } from "./field-values";
import { buildCashImpactReference, buildReorderSortOrder } from "./field-utils";

test("SELECT con optionListKey inexistente falla con FIELD_INVALID_CONFIG", async () => {
  await assert.rejects(
    () =>
      validateFieldDefinitionConfig(
        { fieldType: "SELECT", config: { optionListKey: "lista_no_existe" } },
        { hasOptionListKey: async () => false },
      ),
    (error: any) => error?.code === "FIELD_INVALID_CONFIG",
  );
});

test("normaliza values tipados para sale_field_values", () => {
  const row = normalizeTypedFieldValue({
    valueMoneyAmount: 1234.5,
    valueBool: true,
    valueDate: "2026-03-04",
    currency: "ars",
  });
  assert.equal(row.valueMoneyAmount, "1234.5");
  assert.equal(row.valueBool, true);
  assert.equal(row.valueDate, "2026-03-04");
  assert.equal(row.currency, "ARS");
});

test("reorder mantiene sort_order consistente", () => {
  const rows = buildReorderSortOrder([9, 4, 7]);
  assert.deepEqual(rows, [
    { fieldId: 9, sortOrder: 0 },
    { fieldId: 4, sortOrder: 1 },
    { fieldId: 7, sortOrder: 2 },
  ]);
});

test("referencia de impacto de caja es idempotente", () => {
  const a = buildCashImpactReference("sale", 55, "descuento_manual");
  const b = buildCashImpactReference("sale", 55, "descuento_manual");
  assert.equal(a, b);
});
