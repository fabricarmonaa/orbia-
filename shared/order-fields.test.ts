import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNativeOrderFieldTemplate,
  buildFileStorageKeyFromTokens,
  formatMoneyValue,
  normalizeOrderFieldType,
  parseFileStorageTokens,
  resolveFileFieldBehavior,
  resolveCreateOrderFieldLayout,
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
  assert.equal(isOrderFieldValueFilled("FILE", { fileStorageKey: "draftatts:12,13" }), true);
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

test("separa campos base y custom en secciones ordenadas para el modal de alta", () => {
  const layout = resolveCreateOrderFieldLayout([
    { id: 1, fieldKey: "customer_name", label: "Cliente", fieldType: "TEXT", isActive: true, sortOrder: 0, config: { visibleInForm: true } },
    { id: 2, fieldKey: "paid_amount", label: "Seña o Pago", fieldType: "MONEY", isActive: true, sortOrder: 1, config: { visibleInForm: true } },
    { id: 3, presetId: 10, fieldKey: "modelo", label: "Modelo", fieldType: "TEXT", isActive: true, sortOrder: 2, config: { visibleInForm: true, sectionLabel: "Equipo", sectionOrder: 2 } },
    { id: 4, presetId: 10, fieldKey: "serie", label: "Serie", fieldType: "TEXT", isActive: true, sortOrder: 3, config: { visibleInForm: true, sectionLabel: "Equipo", sectionOrder: 2 } },
    { id: 5, presetId: 10, fieldKey: "tecnico", label: "Técnico", fieldType: "TEXT", isActive: true, sortOrder: 4, config: { visibleInForm: true, sectionLabel: "Operación", sectionOrder: 1 } },
  ]);

  assert.deepEqual(layout.baseFields.map((field) => field.fieldKey), ["customer_name", "paid_amount"]);
  assert.deepEqual(layout.customSections.map((section) => section.label), ["Operación", "Equipo"]);
  assert.deepEqual(layout.customSections[1]?.fields.map((field) => field.fieldKey), ["modelo", "serie"]);
});

test("el layout excluye campos inactivos, borrados o invisibles en formulario", () => {
  const layout = resolveCreateOrderFieldLayout([
    { id: 1, fieldKey: "customer_name", label: "Cliente", fieldType: "TEXT", isActive: false, sortOrder: 0, config: { visibleInForm: true } },
    { id: 2, fieldKey: "legajo", label: "Legajo", fieldType: "TEXT", isActive: true, deletedAt: new Date().toISOString(), sortOrder: 1, config: { visibleInForm: true } },
    { id: 3, fieldKey: "interno", label: "Interno", fieldType: "TEXT", isActive: true, sortOrder: 2, config: { visibleInForm: false } },
    { id: 4, fieldKey: "customer_phone", label: "Teléfono", fieldType: "TEXT", isActive: true, sortOrder: 3, config: { visibleInForm: true } },
  ]);

  assert.deepEqual(layout.baseFields.map((field) => field.fieldKey), ["customer_phone"]);
  assert.equal(layout.customFields.length, 0);
});

test("resuelve comportamiento de bloques multimedia y serializa storage keys múltiples", () => {
  const behavior = resolveFileFieldBehavior({
    mediaMode: "gallery",
    acceptMode: "images",
    maxFiles: 6,
    expectedFiles: 4,
    trackingRender: "carousel",
  });

  assert.equal(behavior.mediaMode, "gallery");
  assert.equal(behavior.acceptMode, "images");
  assert.equal(behavior.maxFiles, 6);
  assert.equal(behavior.expectedFiles, 4);
  assert.equal(behavior.trackingRender, "carousel");

  const tokens = parseFileStorageTokens("draftatts:4,8,15");
  assert.deepEqual(tokens, [
    { kind: "draftatt", id: 4 },
    { kind: "draftatt", id: 8 },
    { kind: "draftatt", id: 15 },
  ]);
  assert.equal(buildFileStorageKeyFromTokens(tokens), "draftatts:4,8,15");
});
