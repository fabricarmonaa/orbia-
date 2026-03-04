const WHATSAPP_DIGITS_RE = /^\d{8,15}$/;

function normalizeProtocol(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function normalizeWhatsapp(input?: string | null): { value: string; error?: string } {
  const raw = String(input || "").trim();
  if (!raw) return { value: "" };

  const digits = raw.replace(/\D/g, "");
  if (WHATSAPP_DIGITS_RE.test(digits)) {
    return { value: `https://wa.me/${digits}` };
  }

  const normalized = normalizeProtocol(raw.replace(/^wa\.me\//i, "https://wa.me/"));
  if (!isValidHttpUrl(normalized)) {
    return { value: "", error: "WhatsApp inválido. Ingresá un número (ej: 2235950783) o un link wa.me." };
  }

  const url = new URL(normalized);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathDigits = url.pathname.replace(/\//g, "").replace(/\D/g, "");
  if (host !== "wa.me" || !WHATSAPP_DIGITS_RE.test(pathDigits)) {
    return { value: "", error: "WhatsApp inválido. Usá formato wa.me/<número> o solo número." };
  }

  return { value: `https://wa.me/${pathDigits}` };
}

export function normalizeWebsite(input?: string | null): { value: string; error?: string } {
  const raw = String(input || "").trim();
  if (!raw) return { value: "" };
  const normalized = normalizeProtocol(raw);
  if (!isValidHttpUrl(normalized)) {
    return { value: "", error: "Web inválida. Ingresá un dominio válido, por ejemplo: mautica.com.ar" };
  }
  const url = new URL(normalized);
  if (!url.hostname || !url.hostname.includes(".")) {
    return { value: "", error: "Web inválida. Ingresá un dominio válido, por ejemplo: mautica.com.ar" };
  }
  return { value: url.toString().replace(/\/$/, "") };
}

export function normalizeInstagramUrl(input?: string | null): { value: string; error?: string } {
  const raw = String(input || "").trim();
  if (!raw) return { value: "" };
  if (!/^https?:\/\//i.test(raw)) {
    return { value: "", error: "Instagram inválido. Pegá el link completo con https://instagram.com/..." };
  }
  if (!isValidHttpUrl(raw)) {
    return { value: "", error: "Instagram inválido. Pegá un link válido de Instagram." };
  }
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (!["instagram.com", "www.instagram.com"].includes(host)) {
    return { value: "", error: "Instagram inválido. El link debe ser de instagram.com." };
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (!path || path === "/") {
    return { value: "", error: "Instagram inválido. Completá el usuario, por ejemplo https://instagram.com/tu_marca" };
  }
  return { value: `https://www.instagram.com${path}` };
}
