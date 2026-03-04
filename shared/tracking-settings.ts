export interface TrackingSettings {
  showOrderNumber: boolean;
  showOrderType: boolean;
  showDates: boolean;
  showHistory: boolean;
  showOnlyCurrentStatus: boolean;
}

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  showOrderNumber: true,
  showOrderType: true,
  showDates: true,
  showHistory: true,
  showOnlyCurrentStatus: false,
};

export function mergeTrackingSettings(value?: Partial<TrackingSettings> | null): TrackingSettings {
  return {
    ...DEFAULT_TRACKING_SETTINGS,
    ...(value || {}),
  };
}
