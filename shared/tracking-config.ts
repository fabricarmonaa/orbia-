export type TrackingLayout = "classic" | "cards" | "stepper" | "minimal";

export interface TrackingVisibilityConfig {
  showLogo: boolean;
  showBusinessName: boolean;
  showOrderNumber: boolean;
  showOrderType: boolean;
  showCustomerName: boolean;
  showCustomerPhone: boolean;
  showDeliveryAddress: boolean;
  showCurrentStatus: boolean;
  showStatusHistory: boolean;
  showCreatedAt: boolean;
  showUpdatedAt: boolean;
  showScheduledAt: boolean;
  showClosedAt: boolean;
  showPublicComments: boolean;
  showDynamicFields: boolean;
  showDynamicFieldUpdatedAt: boolean;
  showTos: boolean;
  showSocialLinks: boolean;
  showPoweredBy: boolean;
}

export interface TrackingDisplayConfig extends TrackingVisibilityConfig {
  layout?: TrackingLayout;
  blockOrder?: string[];
}

export const DEFAULT_TRACKING_VISIBILITY: TrackingVisibilityConfig = {
  showLogo: true,
  showBusinessName: true,
  showOrderNumber: true,
  showOrderType: true,
  showCustomerName: true,
  showCustomerPhone: false,
  showDeliveryAddress: false,
  showCurrentStatus: true,
  showStatusHistory: true,
  showCreatedAt: true,
  showUpdatedAt: true,
  showScheduledAt: true,
  showClosedAt: true,
  showPublicComments: true,
  showDynamicFields: true,
  showDynamicFieldUpdatedAt: true,
  showTos: true,
  showSocialLinks: true,
  showPoweredBy: true,
};

export const DEFAULT_TRACKING_BLOCK_ORDER = ["header", "summary", "history", "comments", "tos", "social", "footer"] as const;

export function normalizeTrackingVisibilityConfig(input?: Partial<TrackingDisplayConfig> | null): TrackingDisplayConfig {
  const raw = input || {};
  const incomingOrder = Array.isArray(raw.blockOrder) ? raw.blockOrder.filter((x): x is string => typeof x === "string") : [];
  const normalizedOrder = [
    ...incomingOrder.filter((id, idx, arr) => DEFAULT_TRACKING_BLOCK_ORDER.includes(id as any) && arr.indexOf(id) === idx),
    ...DEFAULT_TRACKING_BLOCK_ORDER.filter((id) => !incomingOrder.includes(id)),
  ];
  return {
    ...DEFAULT_TRACKING_VISIBILITY,
    ...raw,
    layout: raw.layout && ["classic", "cards", "stepper", "minimal"].includes(raw.layout) ? raw.layout : undefined,
    blockOrder: normalizedOrder,
    showPoweredBy: true,
  };
}
