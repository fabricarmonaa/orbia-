export const DNI_MIN_LENGTH = 6;
export const DNI_MAX_LENGTH = 15;

export function sanitizeDniInput(value: string | null | undefined) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, DNI_MAX_LENGTH);
}

export function normalizeDni(value: string | null | undefined) {
  const digits = sanitizeDniInput(value);
  return digits || null;
}

export function getDniValidationError(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) {
    return `Usá solo números (${DNI_MIN_LENGTH} a ${DNI_MAX_LENGTH} dígitos)`;
  }
  if (trimmed.length < DNI_MIN_LENGTH || trimmed.length > DNI_MAX_LENGTH) {
    return `Ingresá entre ${DNI_MIN_LENGTH} y ${DNI_MAX_LENGTH} dígitos`;
  }
  return null;
}

export function isValidDni(value: string | null | undefined) {
  return getDniValidationError(value) === null;
}
