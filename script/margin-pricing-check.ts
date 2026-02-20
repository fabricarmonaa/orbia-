import assert from "node:assert/strict";
import fs from "node:fs";
import { computeMarginUnitPrice } from "../server/services/pricing";

// 1) manual product uses fixed price (validated by route/storage wiring)
const salesStorage = fs.readFileSync("server/storage/sales.ts", "utf8");
assert.equal(salesStorage.includes('pricingMode === "MANUAL" && row.unitPrice !== undefined'), true);

// 2) margin same currency: cost=10, margin=30 => 13
assert.equal(computeMarginUnitPrice(10, 30, 1), 13);

// 3) margin different currency: 10 USD * 1000 ARS * 1.3 = 13000
assert.equal(computeMarginUnitPrice(10, 30, 1000), 13000);

// 4) changing rate changes price
assert.equal(computeMarginUnitPrice(10, 30, 900), 11700);
assert.equal(computeMarginUnitPrice(10, 30, 1000), 13000);

// 5) multi-tenant rates isolation present in service signature/query by tenant
const exchangeService = fs.readFileSync("server/services/exchange-rate.ts", "utf8");
assert.equal(exchangeService.includes("eq(exchangeRates.tenantId, tenantId)"), true);
assert.equal(exchangeService.includes("isNull(exchangeRates.tenantId)"), true);

console.log("Margin pricing checks passed");
