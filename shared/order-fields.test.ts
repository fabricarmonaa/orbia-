import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNativeOrderFieldTemplate,
  formatMoneyValue,
  normalizeOrderFieldType,
  resolveNativeOrderFieldKind,
  resolveOrderFieldDefinition,
  resolveRenderableOrderFields,
  resolveRenderableOrderFieldsForPreset,
  shouldDisplayOrderFieldInTracking,
  isOrderFieldValueFilled,
} from "./order-fields";

test("permite campos MONEY manuales con configuración consistente", () => {
  const field = resolveOrderFieldDefinition({
    id: 10,
    presetId: 2,
    fieldKey: "senia_extra",
    label: "Seña extra",
    fieldType: "MONEY",
    required: true,
    sortOrder: 3,
    isActive: true,
    visibleInTracking: true,
    config: {
      placeholder: "0,00",
      defaultValue: 1000,
      currencyCode: "USD",
    },
  });

  assert.equal(field.normalizedType, "MONEY");
  assert.equal(field.placeholder, "0,00");
  assert.equal(field.defaultValue, 1000);
  assert.equal(field.currencyCode, "USD");
  assert.match(formatMoneyValue(1234.5, "USD"), /\$/);
});

test("solo renderiza campos activos, visibles y no borrados", () => {
  const fields = resolveRenderableOrderFields([
    { id: 1, presetId: 1, fieldKey: "ok", label: "OK", fieldType: "TEXT", isActive: true, config: { visibleInForm: true } },
    { id: 2, presetId: 1, fieldKey: "hidden", label: "Hidden", fieldType: "TEXT", isActive: true, config: { visibleInForm: false } },
    { id: 3, presetId: 1, fieldKey: "inactive", label: "Inactive", fieldType: "TEXT", isActive: false },
    { id: 4, presetId: 1, fieldKey: "deleted", label: "Deleted", fieldType: "TEXT", isActive: true, deletedAt: new Date().toISOString() },
  ]);

  assert.deepEqual(fields.map((field) => field.id), [1]);
});

test("aísla campos por preset activo", () => {
  const fields = resolveRenderableOrderFieldsForPreset([
    { id: 1, presetId: 1, fieldKey: "campo_a", label: "Campo A", fieldType: "TEXT", isActive: true },
    { id: 2, presetId: 2, fieldKey: "campo_b", label: "Campo B", fieldType: "TEXT", isActive: true },
  ], 2);

  assert.deepEqual(fields.map((field) => field.id), [2]);
});

test("tracking público oculta vacíos por defecto y puede mostrarlos con showWhenEmpty", () => {
  const hidden = shouldDisplayOrderFieldInTracking(
    {
      id: 1,
      fieldKey: "foto",
      label: "Foto",
      fieldType: "FILE",
      isActive: true,
      visibleInTracking: true,
      config: {},
    },
    { fileStorageKey: null },
  );
  const visible = shouldDisplayOrderFieldInTracking(
    {
      id: 2,
      fieldKey: "nota",
      label: "Nota",
      fieldType: "TEXT",
      isActive: true,
      visibleInTracking: true,
      config: { showWhenEmpty: true },
    },
    { valueText: "" },
  );

  assert.equal(hidden, false);
  assert.equal(visible, true);
});

test("considera adjuntos temporales o definitivos como válidos para campos FILE", () => {
  assert.equal(isOrderFieldValueFilled("FILE", { fileStorageKey: "draftatt:12" }), true);
  assert.equal(isOrderFieldValueFilled("FILE", { fileStorageKey: "att:34" }), true);
  assert.equal(isOrderFieldValueFilled("FILE", { fileStorageKey: "" }), false);
});

test("resuelve correctamente el binding semántico de cliente", () => {
  assert.equal(resolveNativeOrderFieldKind({ fieldKey: "customer_name", label: "Cliente" }), "customer");
  assert.equal(resolveNativeOrderFieldKind({ fieldKey: "paid_amount", label: "Seña o Pago" }), "paid");
  assert.equal(resolveNativeOrderFieldKind({ fieldKey: "total_amount", label: "Valor Total" }), "total");
});

test("normaliza aliases de dinero y expone templates nativos monetarios", () => {
  assert.equal(normalizeOrderFieldType("currency"), "MONEY");
  assert.equal(normalizeOrderFieldType("dinero"), "MONEY");

  const paid = buildNativeOrderFieldTemplate("paid");
  const total = buildNativeOrderFieldTemplate("total");

  assert.equal(paid.fieldType, "MONEY");
  assert.equal(total.fieldKey, "total_amount");
  assert.equal(total.visibleInTracking, true);
});
