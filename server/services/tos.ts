import { normalizeText } from "../security/sanitize";

const ALLOWED_TAGS = new Set(["b", "i", "u", "strong", "em", "p", "br", "ul", "li", "ol"]);

export function normalizeTenantSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidTenantSlug(value: string) {
  return /^[a-z0-9-]{1,120}$/.test(value);
}

export function sanitizeTosContent(input: string, maxLen = 20000) {
  const base = normalizeText(String(input || ""), { collapseWhitespace: false })
    .slice(0, maxLen)
    .replace(/<\s*(script|iframe|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\r\n/g, "\n");

  return base.replace(/<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?>/g, (match, rawTag: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const isClosing = /^<\//.test(match);
    if (tag === "br") return "<br>";
    return isClosing ? `</${tag}>` : `<${tag}>`;
  });
}
