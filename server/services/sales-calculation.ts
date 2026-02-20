export type AdjustmentType = "NONE" | "PERCENT" | "FIXED";

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcAdjustment(base: number, type: AdjustmentType, value: number) {
  if (type === "NONE") return 0;
  if (type === "PERCENT") return round2((base * value) / 100);
  return round2(value);
}

export function calculateSaleTotals(params: {
  lineTotals: number[];
  discountType: AdjustmentType;
  discountValue: number;
  surchargeType: AdjustmentType;
  surchargeValue: number;
}) {
  const subtotal = round2(params.lineTotals.reduce((sum, value) => sum + value, 0));
  const rawDiscount = calcAdjustment(subtotal, params.discountType, params.discountValue);
  const discountAmount = Math.min(subtotal, rawDiscount);
  const surchargeBase = subtotal - discountAmount;
  const surchargeAmount = calcAdjustment(surchargeBase, params.surchargeType, params.surchargeValue);
  const totalAmount = round2(subtotal - discountAmount + surchargeAmount);
  return { subtotal, discountAmount, surchargeAmount, totalAmount };
}

export function validateStock(available: number, requested: number) {
  return available >= requested;
}
