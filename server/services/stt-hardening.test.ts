import test from "node:test";
import assert from "node:assert/strict";
import { consumeIntentTicket, hashEntities, issueIntentTicket } from "./stt-intent-ticket";
import { hasSearchFilters, resolveCustomerPurchasesIntent } from "./stt-policy";

test("execute sin ticket falla", () => {
  const ok = consumeIntentTicket({
    ticket: undefined,
    tenantId: 1,
    userId: 7,
    intent: "customer.search",
    entities: { dni: "12345678" },
  });
  assert.equal(ok, false);
});

test("búsqueda sin filtro mínimo falla", () => {
  assert.equal(hasSearchFilters("customer.search", {}), false);
  assert.equal(hasSearchFilters("sale.search", { name: "ab" }), false);
});

test("búsqueda por DNI cumple filtro mínimo", () => {
  assert.equal(hasSearchFilters("customer.search", { dni: "12345678" }), true);
});

test("búsqueda por DNI corto falla", () => {
  assert.equal(hasSearchFilters("customer.search", { dni: "123456" }), false);
  assert.equal(hasSearchFilters("customer.search", { dni: "1234567" }), true);
});

test("búsqueda por rango de fecha válido <=31 días", () => {
  assert.equal(hasSearchFilters("sale.search", { from: "2026-01-01", to: "2026-01-31" }), true);
});

test("búsqueda por rango de fecha inválido >31 días", () => {
  assert.equal(hasSearchFilters("sale.search", { from: "2026-01-01", to: "2026-02-15" }), false);
  assert.equal(hasSearchFilters("sale.search", { from: "2026-02-10", to: "2026-01-10" }), false);
});

test("compras de cliente se mapea a ventas", () => {
  assert.equal(resolveCustomerPurchasesIntent("decime las compras del cliente juan"), "customer_sales");
  assert.equal(resolveCustomerPurchasesIntent("mostrar compras a proveedor acme"), "provider_purchases");
});

test("ticket válido de un solo uso", () => {
  const issued = issueIntentTicket({ tenantId: 1, userId: 9, intent: "customer.search", entities: { dni: "12345678" } });
  const first = consumeIntentTicket({
    ticket: issued.ticket,
    tenantId: 1,
    userId: 9,
    intent: "customer.search",
    entities: { dni: "12345678" },
  });
  const second = consumeIntentTicket({
    ticket: issued.ticket,
    tenantId: 1,
    userId: 9,
    intent: "customer.search",
    entities: { dni: "12345678" },
  });
  assert.equal(first, true);
  assert.equal(second, false);
});

test("hash equivalente para arrays set-like con distinto orden", () => {
  const a = {
    items: [
      { id: 2, name: "B", qty: 1 },
      { id: 1, name: "A", qty: 2 },
    ],
  };
  const b = {
    items: [
      { id: 1, name: "A", qty: 2 },
      { id: 2, name: "B", qty: 1 },
    ],
  };
  assert.equal(hashEntities(a), hashEntities(b));
});

test("ticket no se consume por mismatch y luego permite reintento correcto", () => {
  const entitiesA = {
    items: [
      { sku: "B", qty: 1 },
      { sku: "A", qty: 2 },
    ],
  };
  const entitiesMismatch = {
    items: [
      { sku: "C", qty: 1 },
      { sku: "A", qty: 2 },
    ],
  };
  const entitiesEquivalent = {
    items: [
      { sku: "A", qty: 2 },
      { sku: "B", qty: 1 },
    ],
  };

  const issued = issueIntentTicket({ tenantId: 1, userId: 11, intent: "sale.create", entities: entitiesA });

  const mismatch = consumeIntentTicket({
    ticket: issued.ticket,
    tenantId: 1,
    userId: 11,
    intent: "sale.create",
    entities: entitiesMismatch,
  });
  assert.equal(mismatch, false);

  const retryOk = consumeIntentTicket({
    ticket: issued.ticket,
    tenantId: 1,
    userId: 11,
    intent: "sale.create",
    entities: entitiesEquivalent,
  });
  assert.equal(retryOk, true);
});
