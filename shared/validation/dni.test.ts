import test from "node:test";
import assert from "node:assert/strict";
import { DNI_MAX_LENGTH, DNI_MIN_LENGTH, getDniValidationError, isValidDni, normalizeDni, sanitizeDniInput } from "./dni";

test("sanitiza input de DNI a solo dígitos y respeta longitud máxima", () => {
  assert.equal(sanitizeDniInput("12a.345-678999999"), "12345678999999".slice(0, DNI_MAX_LENGTH));
});

test("normaliza DNI a dígitos o null", () => {
  assert.equal(normalizeDni("00123456"), "00123456");
  assert.equal(normalizeDni("abc"), null);
});

test("rechaza letras y longitudes fuera de rango", () => {
  assert.equal(getDniValidationError("12ab34"), `Usá solo números (${DNI_MIN_LENGTH} a ${DNI_MAX_LENGTH} dígitos)`);
  assert.equal(getDniValidationError("12345"), `Ingresá entre ${DNI_MIN_LENGTH} y ${DNI_MAX_LENGTH} dígitos`);
  assert.equal(getDniValidationError("123456"), null);
  assert.equal(isValidDni("12345678"), true);
  assert.equal(isValidDni("ABC123"), false);
});
