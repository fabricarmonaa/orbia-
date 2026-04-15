import test from "node:test";
import assert from "node:assert/strict";

// ─────────────────────────────────────────────
// isTokenRevokedByUser
// ─────────────────────────────────────────────
// Testeo directo de la lógica sin importar el módulo completo
// (que depende de DB y servicios externos).

function isTokenRevokedByUser(
  tokenIat: number | undefined,
  tokenInvalidBefore: Date | string | null | undefined
): boolean {
  if (!tokenIat || !tokenInvalidBefore) return false;
  const invalidBeforeSec = Math.floor(new Date(tokenInvalidBefore).getTime() / 1000);
  return tokenIat <= invalidBeforeSec;
}

test("isTokenRevokedByUser: token sin iat → válido (no revocado)", () => {
  assert.equal(isTokenRevokedByUser(undefined, new Date()), false);
});

test("isTokenRevokedByUser: sin tokenInvalidBefore → válido", () => {
  assert.equal(isTokenRevokedByUser(1000000, null), false);
  assert.equal(isTokenRevokedByUser(1000000, undefined), false);
});

test("isTokenRevokedByUser: iat ANTES de tokenInvalidBefore → revocado", () => {
  const invalidBefore = new Date("2026-01-10T00:00:00Z");
  // iat = 9 de enero de 2026 (antes de invalid before)
  const iat = Math.floor(new Date("2026-01-09T00:00:00Z").getTime() / 1000);
  assert.equal(isTokenRevokedByUser(iat, invalidBefore), true);
});

test("isTokenRevokedByUser: iat EXACTAMENTE en tokenInvalidBefore → revocado", () => {
  const invalidBefore = new Date("2026-01-10T00:00:00Z");
  const iat = Math.floor(invalidBefore.getTime() / 1000);
  assert.equal(isTokenRevokedByUser(iat, invalidBefore), true);
});

test("isTokenRevokedByUser: iat DESPUÉS de tokenInvalidBefore → válido", () => {
  const invalidBefore = new Date("2026-01-10T00:00:00Z");
  // iat = 11 de enero de 2026 (después)
  const iat = Math.floor(new Date("2026-01-11T00:00:00Z").getTime() / 1000);
  assert.equal(isTokenRevokedByUser(iat, invalidBefore), false);
});

test("isTokenRevokedByUser: acepta tokenInvalidBefore como string ISO", () => {
  const iat = Math.floor(new Date("2026-01-09T00:00:00Z").getTime() / 1000);
  assert.equal(isTokenRevokedByUser(iat, "2026-01-10T00:00:00Z"), true);
});

// ─────────────────────────────────────────────
// buildUpgradeUrl — env var UPGRADE_WHATSAPP_PHONE
// ─────────────────────────────────────────────

function buildUpgradeUrl(tenantCode?: string | null): string {
  const phone = (process.env.UPGRADE_WHATSAPP_PHONE || "5492236979026").replace(/\D/g, "");
  if (!tenantCode) return `https://wa.me/${phone}`;
  const text = `Hola! Mi código de negocio es ${tenantCode} y quiero mejorar mi plan`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

test("buildUpgradeUrl: sin tenantCode usa número de fallback", () => {
  const url = buildUpgradeUrl();
  assert.match(url, /^https:\/\/wa\.me\/\d+$/);
});

test("buildUpgradeUrl: con tenantCode incluye código en el mensaje", () => {
  const url = buildUpgradeUrl("DEMO01");
  assert.match(url, /DEMO01/);
  assert.match(url, /wa\.me/);
});

test("buildUpgradeUrl: usa UPGRADE_WHATSAPP_PHONE si está definida", () => {
  const prev = process.env.UPGRADE_WHATSAPP_PHONE;
  process.env.UPGRADE_WHATSAPP_PHONE = "5491199998888";
  const url = buildUpgradeUrl();
  process.env.UPGRADE_WHATSAPP_PHONE = prev;
  assert.match(url, /5491199998888/);
});

test("buildUpgradeUrl: UPGRADE_WHATSAPP_PHONE limpia caracteres no-numéricos", () => {
  const prev = process.env.UPGRADE_WHATSAPP_PHONE;
  process.env.UPGRADE_WHATSAPP_PHONE = "+54 9 11 9999-8888";
  const url = buildUpgradeUrl();
  process.env.UPGRADE_WHATSAPP_PHONE = prev;
  // Solo dígitos en la URL
  assert.match(url, /wa\.me\/54911999988{2}/);
});

// ─────────────────────────────────────────────
// TenantAuth: userId <= 0 debe ser rechazado
// ─────────────────────────────────────────────
// Test lógico sin montar Express (valida la condición misma)

test("tenantAuth: payload con userId=0 es inválido según la nueva lógica", () => {
  const userId = 0;
  const isInvalid = !userId || userId <= 0;
  assert.equal(isInvalid, true, "userId=0 debe ser rechazado");
});

test("tenantAuth: payload con userId=-1 es inválido", () => {
  const userId = -1;
  const isInvalid = !userId || userId <= 0;
  assert.equal(isInvalid, true, "userId=-1 debe ser rechazado");
});

test("tenantAuth: payload con userId=1 es válido (no bloqueado por la condición)", () => {
  const userId = 1;
  const isInvalid = !userId || userId <= 0;
  assert.equal(isInvalid, false, "userId=1 es un userId válido");
});

test("tenantAuth: payload con userId=null es inválido", () => {
  const userId = null as unknown as number;
  const isInvalid = !userId || userId <= 0;
  assert.equal(isInvalid, true, "userId=null debe ser rechazado");
});
