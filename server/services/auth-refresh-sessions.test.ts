import test from "node:test";
import assert from "node:assert/strict";
import {
  isRefreshSessionUsable,
  getRefreshSessionExpiry,
  hashRefreshToken,
  buildRefreshTokenValue,
} from "./auth-refresh-sessions";

// ─────────────────────────────────────────────
// isRefreshSessionUsable
// ─────────────────────────────────────────────

test("isRefreshSessionUsable: sesión válida (no revocada, no expirada)", () => {
  const futureDate = new Date(Date.now() + 60 * 1000); // 1 min en el futuro
  assert.equal(isRefreshSessionUsable({ revokedAt: null, expiresAt: futureDate }), true);
});

test("isRefreshSessionUsable: sesión revocada → no usable", () => {
  const futureDate = new Date(Date.now() + 60 * 1000);
  assert.equal(
    isRefreshSessionUsable({ revokedAt: new Date(), expiresAt: futureDate }),
    false
  );
});

test("isRefreshSessionUsable: sesión expirada → no usable", () => {
  const pastDate = new Date(Date.now() - 60 * 1000); // 1 min en el pasado
  assert.equal(isRefreshSessionUsable({ revokedAt: null, expiresAt: pastDate }), false);
});

test("isRefreshSessionUsable: sesión expirada Y revocada → no usable", () => {
  const pastDate = new Date(Date.now() - 60 * 1000);
  assert.equal(isRefreshSessionUsable({ revokedAt: new Date(), expiresAt: pastDate }), false);
});

// ─────────────────────────────────────────────
// getRefreshSessionExpiry — TTL correcto
// ─────────────────────────────────────────────

test("getRefreshSessionExpiry: remember=false usa short TTL (default 3 días)", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const expiry = getRefreshSessionExpiry(false, now);
  const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  // El short TTL default es 3 días
  assert.ok(
    Math.abs(diffDays - 3) < 0.01,
    `Se esperaba ~3 días, se obtuvo ${diffDays}`
  );
});

test("getRefreshSessionExpiry: remember=true usa long TTL (default 90 días, NO 3650)", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const expiry = getRefreshSessionExpiry(true, now);
  const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  // El long TTL default ahora es 90 días (reducido de 3650)
  assert.ok(
    diffDays <= 365,
    `El TTL de remember-device NO debe ser mayor a 1 año. Se obtuvo ${diffDays} días.`
  );
  assert.ok(
    diffDays >= 30,
    `El TTL de remember-device debe ser al menos 30 días. Se obtuvo ${diffDays} días.`
  );
});

test("getRefreshSessionExpiry: expiry está siempre en el futuro", () => {
  const now = new Date();
  const expiry = getRefreshSessionExpiry(false, now);
  assert.ok(expiry.getTime() > now.getTime(), "La expiry debe estar en el futuro");
});

// ─────────────────────────────────────────────
// hashRefreshToken — determinismo y unicidad
// ─────────────────────────────────────────────

test("hashRefreshToken: mismo token produce mismo hash (determinista)", () => {
  const token = "test-refresh-token-123";
  assert.equal(hashRefreshToken(token), hashRefreshToken(token));
});

test("hashRefreshToken: tokens distintos producen hashes distintos", () => {
  const hash1 = hashRefreshToken("token-a");
  const hash2 = hashRefreshToken("token-b");
  assert.notEqual(hash1, hash2);
});

test("hashRefreshToken: el hash NO es igual al token original", () => {
  const token = "my-raw-token";
  assert.notEqual(hashRefreshToken(token), token);
});

// ─────────────────────────────────────────────
// buildRefreshTokenValue — entropía
// ─────────────────────────────────────────────

test("buildRefreshTokenValue: genera tokens únicos en cada llamada", () => {
  const t1 = buildRefreshTokenValue();
  const t2 = buildRefreshTokenValue();
  assert.notEqual(t1, t2, "Dos tokens generados deben ser distintos");
});

test("buildRefreshTokenValue: token tiene longitud mínima razonable (>= 32 chars)", () => {
  const t = buildRefreshTokenValue();
  assert.ok(t.length >= 32, `Token demasiado corto: ${t.length} chars`);
});

test("buildRefreshTokenValue: token es base64url (sin caracteres problemáticos)", () => {
  const t = buildRefreshTokenValue();
  // base64url usa A-Z, a-z, 0-9, -, _ (sin +, /, =)
  assert.match(t, /^[A-Za-z0-9\-_]+$/, "Token debe ser base64url sin +, /, =");
});
