const VARIABLE_REGEX = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export function renderTemplate(body: string, context: Record<string, string | number | null | undefined>) {
  return (body || "").replace(VARIABLE_REGEX, (_, key: string) => {
    const value = context[key];
    if (value === null || value === undefined) return "—";
    return String(value);
  });
}

export function normalizePhoneE164(rawPhone: string, defaultCountry = "AR"): string | null {
  const cleaned = String(rawPhone || "").replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  if (cleaned.startsWith("+")) {
    const digits = cleaned.replace(/\D/g, "");
    return digits.length >= 8 ? digits : null;
  }

  if (cleaned.startsWith("00")) {
    const digits = cleaned.slice(2).replace(/\D/g, "");
    return digits.length >= 8 ? digits : null;
  }

  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return null;

  if (defaultCountry.toUpperCase() === "AR") {
    if (digits.startsWith("549") && digits.length >= 12) return digits;
    if (digits.startsWith("54") && digits.length >= 12) return `549${digits.slice(2)}`;
    if (digits.startsWith("11") && digits.length === 10) return `549${digits}`;
    if (digits.length === 10 || digits.length === 11) return `549${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

export function isMobileDevice(userAgent: string) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent || "");
}
