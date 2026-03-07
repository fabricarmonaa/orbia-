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

export function normalizeTrackingVisibilityConfig(input?: Partial<TrackingVisibilityConfig> | null): TrackingVisibilityConfig {
  return { ...DEFAULT_TRACKING_VISIBILITY, ...(input || {}), showPoweredBy: true };
}
