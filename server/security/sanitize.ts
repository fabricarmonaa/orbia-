const TAG_REGEX = /<[^>]*>/g;
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripHtmlTags(value: string) {
  return value.replace(TAG_REGEX, "");
}

export function normalizeText(value: string, options?: { collapseWhitespace?: boolean }) {
  const collapseWhitespace = options?.collapseWhitespace ?? true;
  const withoutControls = value.replace(CONTROL_CHARS_REGEX, " ");
  const trimmed = withoutControls.trim();
  if (!collapseWhitespace) return trimmed;
  return trimmed.replace(/\s+/g, " ");
}

export function sanitizeShortText(value: string, maxLength: number) {
  const stripped = stripHtmlTags(value);
  const normalized = normalizeText(stripped, { collapseWhitespace: true });
  const allowed = normalized.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,\-_()/:;#+%&@]/g, "");
  return allowed.slice(0, maxLength);
}

export function sanitizeLongText(value: string, maxLength: number) {
  const stripped = stripHtmlTags(value);
  const normalized = normalizeText(stripped, { collapseWhitespace: false });
  return normalized.slice(0, maxLength);
}

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
