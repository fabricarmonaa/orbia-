import type { AuthUser } from "../../lib/auth";

const DRAFT_VERSION = "v3";
const TAB_ID_KEY = "orbia_tab_id";

export type OrderDraftScope = {
  user: Pick<AuthUser, "id" | "tenantId"> | null | undefined;
  type: string;
  presetId?: number | null;
};

export type StoredOrderDraft<TDraft, TCustomFields> = {
  version: string;
  tenantId: number | null;
  userId: number | null;
  type: string;
  presetId: number | null;
  tabId: string;
  updatedAt: string;
  newOrder: TDraft;
  customFieldInputs: TCustomFields;
};

function getTabId() {
  const existing = sessionStorage.getItem(TAB_ID_KEY);
  if (existing) return existing;
  const created = `tab-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(TAB_ID_KEY, created);
  return created;
}

export function getOrderDraftKey(scope: OrderDraftScope) {
  return [
    "orbia_order_draft",
    DRAFT_VERSION,
    scope.user?.tenantId ?? "tenant-anon",
    scope.user?.id ?? "user-anon",
    String(scope.type || "PEDIDO").toUpperCase(),
    scope.presetId ?? "default",
    getTabId(),
  ].join(":");
}

export function saveOrderDraft<TDraft, TCustomFields>(scope: OrderDraftScope, value: { newOrder: TDraft; customFieldInputs: TCustomFields }) {
  const payload: StoredOrderDraft<TDraft, TCustomFields> = {
    version: DRAFT_VERSION,
    tenantId: scope.user?.tenantId ?? null,
    userId: scope.user?.id ?? null,
    type: String(scope.type || "PEDIDO").toUpperCase(),
    presetId: scope.presetId ?? null,
    tabId: getTabId(),
    updatedAt: new Date().toISOString(),
    newOrder: value.newOrder,
    customFieldInputs: value.customFieldInputs,
  };
  localStorage.setItem(getOrderDraftKey(scope), JSON.stringify(payload));
}

export function loadOrderDraft<TDraft, TCustomFields>(scope: OrderDraftScope) {
  const raw = localStorage.getItem(getOrderDraftKey(scope));
  if (!raw) return null;
  const payload = JSON.parse(raw) as StoredOrderDraft<TDraft, TCustomFields>;
  if (payload.version !== DRAFT_VERSION) return null;
  if ((payload.tenantId ?? null) !== (scope.user?.tenantId ?? null)) return null;
  if ((payload.userId ?? null) !== (scope.user?.id ?? null)) return null;
  if (payload.type !== String(scope.type || "PEDIDO").toUpperCase()) return null;
  if ((payload.presetId ?? null) !== (scope.presetId ?? null)) return null;
  return payload;
}

export function clearOrderDraft(scope: OrderDraftScope) {
  localStorage.removeItem(getOrderDraftKey(scope));
}
