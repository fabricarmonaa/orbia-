import test from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../lib/http-errors";
import { STANDARD_ORDER_TYPES } from "@shared/order-types";
import { normalizeFieldTypeInput, normalizeOrderPresetFieldConfig } from "./order-presets.shared";

test("lista estándar contempla PEDIDO, ENCARGO, TURNO y SERVICIO", () => {
  assert.deepEqual(STANDARD_ORDER_TYPES.map((type) => type.code), ["PEDIDO", "ENCARGO", "TURNO", "SERVICIO"]);
});

test("normaliza aliases de MONEY y persiste currency/defaultValue numérico", () => {
  assert.equal(normalizeFieldTypeInput("currency"), "MONEY");
  assert.equal(normalizeFieldTypeInput("dinero"), "MONEY");

  const config = normalizeOrderPresetFieldConfig("MONEY", {
    currencyCode: "usd",
    defaultValue: "1500.5",
    placeholder: "Importe",
  });

  assert.equal(config.currencyCode, "USD");
  assert.equal(config.defaultValue, 1500.5);
  assert.equal(config.placeholder, "Importe");
});

test("rechaza defaults inválidos de MONEY con 4xx en lugar de 500", () => {
  assert.throws(
    () => normalizeOrderPresetFieldConfig("MONEY", { defaultValue: "no-num" }),
    (error: unknown) => error instanceof HttpError && error.status === 400 && error.code === "ORDER_PRESET_VALIDATION_ERROR"
  );
});
