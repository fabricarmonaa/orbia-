export type PaginationInput = {
  limit?: unknown;
  page?: unknown;
  cursor?: unknown;
  offset?: unknown;
};

export type CursorValue = { createdAt: string; id: number };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function normalizeLimit(raw: unknown, fallback = DEFAULT_LIMIT) {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
}

export function normalizePage(raw: unknown) {
  const parsed = Number(raw ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

export function parseCursor(raw: unknown): CursorValue | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as CursorValue;
    const id = Number(parsed?.id);
    if (!parsed?.createdAt || !Number.isFinite(id) || id <= 0) return null;
    return { createdAt: String(parsed.createdAt), id: Math.trunc(id) };
  } catch {
    return null;
  }
}

export function buildCursor(value: CursorValue) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function resolvePagination(input: PaginationInput) {
  const limit = normalizeLimit(input.limit);
  const cursor = parseCursor(input.cursor);
  const offsetFromPage = (normalizePage(input.page) - 1) * limit;
  const offsetRaw = Number(input.offset);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.trunc(offsetRaw)) : offsetFromPage;
  return { limit, offset, cursor };
}
