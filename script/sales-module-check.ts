import assert from "node:assert/strict";
import { calculateSaleTotals, validateStock } from "../server/services/sales-calculation";

const totals = calculateSaleTotals({
  lineTotals: [100, 50],
  discountType: "PERCENT",
  discountValue: 10,
  surchargeType: "FIXED",
  surchargeValue: 5,
});

assert.equal(totals.subtotal, 150);
assert.equal(totals.discountAmount, 15);
assert.equal(totals.surchargeAmount, 5);
assert.equal(totals.totalAmount, 140);

assert.equal(validateStock(5, 4), true);
assert.equal(validateStock(2, 3), false);

console.log("Sales checks passed");
