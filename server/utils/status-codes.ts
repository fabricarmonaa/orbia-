export const STT_INTERACTION_STATUS = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
} as const;

export type SttInteractionStatus = (typeof STT_INTERACTION_STATUS)[keyof typeof STT_INTERACTION_STATUS];

export const DELIVERY_STATUS = {
  PENDING: "PENDING",
  ASSIGNED: "ASSIGNED",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  CANCELED: "CANCELED",
} as const;

export type DeliveryStatusCode = (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];
