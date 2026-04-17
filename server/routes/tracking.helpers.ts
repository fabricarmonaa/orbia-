import { parseFileStorageTokens } from "@shared/order-fields";

export function buildPublicTrackingAttachmentUrl(trackingId: string, attachmentId: number, options?: { download?: boolean }) {
  const base = `/api/public/tracking/${encodeURIComponent(String(trackingId || ""))}/attachments/${attachmentId}`;
  return options?.download ? `${base}?download=1` : base;
}

export function isTrackingAttachmentVisible(
  fields: Array<{
    fileStorageKey?: string | null;
    visibleOverride?: boolean | null;
    visibleInTracking?: boolean | null;
  }>,
  attachmentId: number,
) {
  return fields.some((f) => {
    const visible = f.visibleOverride === true || (f.visibleOverride !== false && f.visibleInTracking === true);
    return visible && parseFileStorageTokens(f.fileStorageKey).some((token) => token.kind === "att" && token.id === attachmentId);
  });
}
