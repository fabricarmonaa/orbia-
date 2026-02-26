import crypto from "crypto";

interface TicketPayload {
  tenantId: number;
  userId: number;
  intent: string;
  entitiesHash: string;
  expiresAt: number;
}

const TTL_MS = 15_000;
const tickets = new Map<string, TicketPayload>();

function cleanupExpired(now = Date.now()) {
  tickets.forEach((value, key) => {
    if (value.expiresAt <= now) tickets.delete(key);
  });
}

export function hashEntities(entities: Record<string, unknown>) {
  const normalized = JSON.stringify(sortObject(entities));
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map(sortObject);
    const sortable = mapped.every((item) => !!item && typeof item === "object" && !Array.isArray(item));
    if (!sortable) return mapped;

    const withKeys = mapped.map((item, index) => {
      const record = item as Record<string, unknown>;
      const stable = ["id", "sku", "code", "name"]
        .map((k) => record[k])
        .find((v) => v !== undefined && v !== null && String(v).trim() !== "");
      return {
        item,
        index,
        stableKey: stable === undefined ? null : String(stable),
      };
    });

    if (withKeys.every((r) => r.stableKey === null)) return mapped;

    withKeys.sort((a, b) => {
      if (a.stableKey === null && b.stableKey === null) return a.index - b.index;
      if (a.stableKey === null) return 1;
      if (b.stableKey === null) return -1;
      const byStable = a.stableKey.localeCompare(b.stableKey);
      if (byStable !== 0) return byStable;
      return JSON.stringify(a.item).localeCompare(JSON.stringify(b.item));
    });

    return withKeys.map((r) => r.item);
  }
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortObject((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

export function issueIntentTicket(params: { tenantId: number; userId: number; intent: string; entities: Record<string, unknown> }) {
  cleanupExpired();
  const ticket = crypto.randomBytes(24).toString("hex");
  tickets.set(ticket, {
    tenantId: params.tenantId,
    userId: params.userId,
    intent: params.intent,
    entitiesHash: hashEntities(params.entities),
    expiresAt: Date.now() + TTL_MS,
  });
  return { ticket, expiresAt: new Date(Date.now() + TTL_MS).toISOString(), ttlMs: TTL_MS };
}

export function consumeIntentTicket(params: {
  ticket?: string;
  tenantId: number;
  userId: number;
  intent: string;
  entities: Record<string, unknown>;
}) {
  cleanupExpired();
  if (!params.ticket) return false;
  const row = tickets.get(params.ticket);
  if (!row) return false;
  if (row.expiresAt <= Date.now()) {
    tickets.delete(params.ticket);
    return false;
  }
  const ok = (
    row.tenantId === params.tenantId &&
    row.userId === params.userId &&
    row.intent === params.intent &&
    row.entitiesHash === hashEntities(params.entities)
  );
  if (ok) tickets.delete(params.ticket);
  return ok;
}
