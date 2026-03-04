import test from "node:test";
import assert from "node:assert/strict";
import { mapFieldTypeToInputKind } from "./input-mapping";
import { normalizeFieldKey } from "@shared/validators/fields";

test("normaliza key en formato slug estable", () => {
  assert.equal(normalizeFieldKey("Técnico Asignado"), "tecnico_asignado");
});

test("map de tipo desconocido cae en TEXT", () => {
  assert.equal(mapFieldTypeToInputKind("RANDOM"), "TEXT");
});

test("map de tipo conocido conserva valor", () => {
  assert.equal(mapFieldTypeToInputKind("money"), "MONEY");
});
