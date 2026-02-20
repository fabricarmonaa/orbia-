import { strict as assert } from "assert";
import { sanitizeLongText } from "../server/security/sanitize";

function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function protectFormula(value: string) {
  const cleaned = sanitizeLongText(value, 200).trim();
  if (!cleaned) return cleaned;
  return ["=", "+", "-", "@"].includes(cleaned[0]) ? `'${cleaned}` : cleaned;
}

function run() {
  assert.equal(normalizeHeader("Código Producto"), "codigo_producto");
  assert.equal(normalizeHeader("Razón Social"), "razon_social");
  assert.equal(protectFormula("=2+2"), "'=2+2");
  assert.equal(protectFormula("+SUM(A1:A3)"), "'+SUM(A1:A3)");
  assert.equal(protectFormula("Cliente normal"), "Cliente normal");
  console.log("Excel import checks passed");
}

run();
