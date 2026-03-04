import test from "node:test";
import assert from "node:assert/strict";
import { mergeFieldDefinitions } from "./merge-field-definitions";

test("conflicto preset/global: prevalece definición canónica", () => {
  const result = mergeFieldDefinitions({
    presetFields: [{ id: 1, fieldKey: "repuesto", label: "Repuesto", fieldType: "TEXT", required: false, sortOrder: 0, config: {} }],
    globalFields: [{ id: 11, fieldKey: "repuesto", label: "Repuesto", fieldType: "MONEY", required: false, sortOrder: 3, config: { direction: "OUT" } }],
  });
  assert.equal(result.mergedFields[0]?.fieldType, "MONEY");
  assert.deepEqual(result.mergedFields[0]?.config, { direction: "OUT" });
  assert.equal(result.warnings.some((warning) => warning.code === "FIELD_CONFLICT_CANONICAL"), true);
});

test("regla required final: global.required || preset.required", () => {
  const result = mergeFieldDefinitions({
    presetFields: [{ id: 1, fieldKey: "imei", label: "IMEI", fieldType: "TEXT", required: true, sortOrder: 0, config: {} }],
    globalFields: [{ id: 2, fieldKey: "imei", label: "IMEI", fieldType: "TEXT", required: false, sortOrder: 9, config: {} }],
  });
  assert.equal(result.mergedFields[0]?.required, true);
});

test("merge idempotente y orden estable", () => {
  const input = {
    presetFields: [
      { id: 1, fieldKey: "a", label: "A", fieldType: "TEXT" as const, required: false, sortOrder: 2, config: {} },
      { id: 2, fieldKey: "b", label: "B", fieldType: "TEXT" as const, required: false, sortOrder: 1, config: {} },
    ],
    globalFields: [
      { id: 3, fieldKey: "a", label: "A", fieldType: "TEXT" as const, required: false, sortOrder: 20, config: {} },
      { id: 4, fieldKey: "b", label: "B", fieldType: "TEXT" as const, required: false, sortOrder: 10, config: {} },
    ],
  };
  const first = mergeFieldDefinitions(input);
  const second = mergeFieldDefinitions(input);
  assert.deepEqual(first.mergedFields.map((field) => ({ key: field.fieldKey, sortOrder: field.sortOrder })), [
    { key: "b", sortOrder: 1 },
    { key: "a", sortOrder: 2 },
  ]);
  assert.deepEqual(first.mergedFields, second.mergedFields);
});

test("valor incompatible: field NUMBER con valor textual previo", () => {
  const result = mergeFieldDefinitions({
    presetFields: [],
    globalFields: [{ id: 10, fieldKey: "serie", label: "Serie", fieldType: "NUMBER", required: false, sortOrder: 0, config: {} }],
    existingValues: [{ fieldKey: "serie", valueNumber: "texto" }],
  });
  assert.equal(result.incompatibleValueKeys.includes("serie"), true);
  assert.equal(result.warnings.some((warning) => warning.code === "FIELD_VALUE_INCOMPATIBLE"), true);
});
