export interface PasswordPolicyContext {
  dni?: string | null;
  tenantCode?: string | null;
  tenantName?: string | null;
  email?: string | null;
}

export interface PasswordPolicyEvaluation {
  score: number;
  warnings: string[];
  isValid: boolean;
  requirements: {
    minLength: boolean;
    upper: boolean;
    lower: boolean;
    number: boolean;
    symbol: boolean;
    notCommon: boolean;
    notContainsDni: boolean;
    notContainsTenantCode: boolean;
    notContainsTenantName: boolean;
  };
}

const COMMON_PASSWORDS = new Set([
  "password", "password123", "password123!", "qwerty", "qwerty123", "admin", "admin123", "123456",
  "12345678", "123456789", "1234567890", "abc123", "letmein", "welcome", "iloveyou", "changeme",
  "test1234", "passw0rd", "zaq12wsx", "dragon", "monkey", "sunshine", "football", "princess", "master",
  "superman", "hola123", "orbia123", "password1", "p@ssw0rd", "pass1234", "asdfgh", "1q2w3e4r",
]);

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function evaluatePassword(password: string, context: PasswordPolicyContext = {}): PasswordPolicyEvaluation {
  const value = String(password || "");
  const normalized = normalize(value);
  const normalizedNoSpaces = normalized.replace(/\s+/g, "");
  const dni = normalize(context.dni).replace(/\D/g, "");
  const tenantCode = normalize(context.tenantCode);
  const tenantName = normalize(context.tenantName).replace(/\s+/g, "");

  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  const minLength = value.length >= 12;
  const passphraseOverride = value.length >= 20;
  const notCommon = !COMMON_PASSWORDS.has(normalizedNoSpaces);
  const notContainsDni = !dni || dni.length < 4 || !normalizedNoSpaces.includes(dni);
  const notContainsTenantCode = !tenantCode || tenantCode.length < 3 || !normalizedNoSpaces.includes(tenantCode.replace(/\s+/g, ""));
  const notContainsTenantName = !tenantName || tenantName.length < 4 || !normalizedNoSpaces.includes(tenantName);

  const varietyOk = hasUpper && hasLower && hasNumber && hasSymbol;
  const isValid = minLength && notCommon && notContainsDni && notContainsTenantCode && notContainsTenantName && (varietyOk || passphraseOverride);

  const warnings: string[] = [];
  if (!minLength) warnings.push("Debe tener al menos 12 caracteres");
  if (!passphraseOverride && !hasUpper) warnings.push("Debe incluir al menos una mayúscula");
  if (!passphraseOverride && !hasLower) warnings.push("Debe incluir al menos una minúscula");
  if (!passphraseOverride && !hasNumber) warnings.push("Debe incluir al menos un número");
  if (!passphraseOverride && !hasSymbol) warnings.push("Debe incluir al menos un símbolo");
  if (!notCommon) warnings.push("La contraseña es demasiado común");
  if (!notContainsDni) warnings.push("No puede contener DNI");
  if (!notContainsTenantCode) warnings.push("No puede contener el código del tenant");
  if (!notContainsTenantName) warnings.push("No puede contener el nombre del negocio");

  let score = 0;
  if (value.length >= 12) score += 20;
  if (value.length >= 16) score += 10;
  if (value.length >= 20) score += 10;
  if (hasUpper) score += 15;
  if (hasLower) score += 15;
  if (hasNumber) score += 15;
  if (hasSymbol) score += 15;
  if (notCommon) score += 10;
  if (!notContainsDni || !notContainsTenantCode || !notContainsTenantName) score -= 20;
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    warnings,
    isValid,
    requirements: {
      minLength,
      upper: hasUpper || passphraseOverride,
      lower: hasLower || passphraseOverride,
      number: hasNumber || passphraseOverride,
      symbol: hasSymbol || passphraseOverride,
      notCommon,
      notContainsDni,
      notContainsTenantCode,
      notContainsTenantName,
    },
  };
}

const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "1212"]);

export function validateCashierPin(pin: string) {
  const value = String(pin || "");
  if (!/^\d{4,8}$/.test(value)) return { isValid: false, reason: "PIN inválido: usar 4 a 8 dígitos" };
  if (WEAK_PINS.has(value)) return { isValid: false, reason: "PIN demasiado predecible" };
  return { isValid: true, reason: "" };
}
