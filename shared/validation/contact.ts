const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const STRICT_EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const BLOCKED_DOMAINS = new Set(["g.com", "test.com", "example.com", "mailinator.com", "tempmail.com"]);

export function normalizePhone(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

export function isValidPhone(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return true;
  if (!/^\+?[\d\s-]{6,20}$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

export function isValidEmail(raw: string | null | undefined, strict = false) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return true;
  const regex = strict ? STRICT_EMAIL_REGEX : BASIC_EMAIL_REGEX;
  if (!regex.test(value)) return false;
  const [, domain = ""] = value.split("@");
  if (!domain.includes(".")) return false;
  if (strict && BLOCKED_DOMAINS.has(domain)) return false;
  return true;
}

export function shouldUseStrictEmailValidation() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}
