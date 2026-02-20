import type { Product } from "@shared/schema";

export function computeMarginUnitPrice(costAmount: number, marginPct: number, rate: number) {
  const converted = costAmount * rate;
  const final = converted * (1 + marginPct / 100);
  return Math.round((final + Number.EPSILON) * 100) / 100;
}

export async function resolveProductUnitPrice(product: Product, tenantId: number, saleCurrency: string) {
  const pricingMode = (product.pricingMode || "MANUAL").toUpperCase();
  if (pricingMode !== "MARGIN") {
    return Number(product.price);
  }

  const costAmount = Number(product.costAmount ?? product.cost ?? 0);
  const marginPct = Number(product.marginPct ?? 0);
  const costCurrency = String(product.costCurrency || saleCurrency || "ARS").toUpperCase();
  if (!costAmount || marginPct < 0) throw new Error("MARGIN_PRODUCT_INVALID");
  if (marginPct > 1000) throw new Error("MARGIN_OUT_OF_RANGE");

  const { getExchangeRate } = await import("./exchange-rate");
  const rate = await getExchangeRate(costCurrency, saleCurrency, tenantId);
  return computeMarginUnitPrice(costAmount, marginPct, rate);
}
