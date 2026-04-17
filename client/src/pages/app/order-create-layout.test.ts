import test from "node:test";
import assert from "node:assert/strict";
import { pickNextPresetForSelection, resolveOrderCreateLayout } from "./order-create-layout";

test("fallback seguro al eliminar o perder el preset seleccionado", () => {
  const next = pickNextPresetForSelection([
    { id: 1, code: "default", label: "Default", isActive: true, sortOrder: 0 },
    { id: 2, code: "express", label: "Express", isActive: true, sortOrder: 1 },
  ], 99);

  assert.equal(next?.id, 1);
});

test("mantiene separados los campos base y custom por preset/layout", () => {
  const layout = resolveOrderCreateLayout([
    { id: 1, presetId: 3, fieldKey: "customer_name", label: "Cliente", fieldType: "TEXT", isActive: true, sortOrder: 0, config: { visibleInForm: true } },
    { id: 2, presetId: 3, fieldKey: "imei", label: "IMEI", fieldType: "TEXT", isActive: true, sortOrder: 1, config: { visibleInForm: true, sectionLabel: "Equipo", sectionOrder: 1 } },
    { id: 3, presetId: 3, fieldKey: "falla", label: "Falla", fieldType: "TEXT_LONG", isActive: true, sortOrder: 2, config: { visibleInForm: true, sectionLabel: "Diagnóstico", sectionOrder: 2 } },
  ]);

  assert.deepEqual(layout.baseFields.map((field) => field.fieldKey), ["customer_name"]);
  assert.deepEqual(layout.customSections.map((section) => section.label), ["Equipo", "Diagnóstico"]);
});

test("cambiar de tipo hace fallback al preset válido del nuevo tipo sin mezclar selección previa", () => {
  const pedidoPreset = pickNextPresetForSelection([
    { id: 1, code: "default", label: "Pedido base", isActive: true, sortOrder: 0 },
    { id: 2, code: "express", label: "Express", isActive: true, sortOrder: 1 },
  ], 2);
  const servicioPreset = pickNextPresetForSelection([
    { id: 10, code: "default", label: "Servicio base", isActive: true, sortOrder: 0 },
    { id: 11, code: "taller", label: "Taller", isActive: true, sortOrder: 1 },
  ], pedidoPreset?.id);

  assert.equal(pedidoPreset?.id, 2);
  assert.equal(servicioPreset?.id, 10);
});
