import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { exchangeRates } from "@shared/schema";

export async function getExchangeRate(baseCurrency: string, targetCurrency: string, tenantId?: number | null): Promise<number> {
  const base = String(baseCurrency || "").toUpperCase();
  const target = String(targetCurrency || "").toUpperCase();
  if (!base || !target) throw new Error("EXCHANGE_RATE_CURRENCY_REQUIRED");
  if (base === target) return 1;

  if (tenantId) {
    const [tenantRate] = await db
      .select()
      .from(exchangeRates)
      .where(and(eq(exchangeRates.tenantId, tenantId), eq(exchangeRates.baseCurrency, base), eq(exchangeRates.targetCurrency, target)));
    if (tenantRate) return Number(tenantRate.rate);
  }

  const [globalRate] = await db
    .select()
    .from(exchangeRates)
    .where(and(isNull(exchangeRates.tenantId), eq(exchangeRates.baseCurrency, base), eq(exchangeRates.targetCurrency, target)));
  if (globalRate) return Number(globalRate.rate);

  throw new Error(`EXCHANGE_RATE_NOT_FOUND:${base}:${target}`);
}
