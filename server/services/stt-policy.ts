import { sanitizeShortText } from "../security/sanitize";

export function detectExfiltration(text: string) {
  const t = text.toLowerCase();
  return ["dump", "export", "todos los dni", "dame todos", "list all"].some((token) => t.includes(token));
}

export function hasSearchFilters(intent: string, entities: Record<string, unknown>) {
  if (!["customer.search", "customer.purchases", "sale.search"].includes(intent)) return true;

  const dni = String(entities.dni || entities.doc || "").replace(/\D/g, "");
  const q = sanitizeShortText(String(entities.q || entities.name || entities.customerName || ""), 200).trim();
  const saleNumber = sanitizeShortText(String(entities.saleNumber || entities.number || ""), 50).trim();
  const from = String(entities.from || "").trim();
  const to = String(entities.to || "").trim();

  if (dni.length >= 7) return true;
  if (q.length >= 3) return true;
  if (saleNumber.length >= 1) return true;
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return false;
    if (toDate < fromDate) return false;
    const diffMs = toDate.getTime() - fromDate.getTime();
    const maxRangeMs = 31 * 24 * 60 * 60 * 1000;
    if (diffMs > maxRangeMs) return false;
    return true;
  }

  return false;
}

export function resolveCustomerPurchasesIntent(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("compras a proveedor") || lower.includes("compras de proveedor")) {
    return "provider_purchases" as const;
  }
  return "customer_sales" as const;
}
