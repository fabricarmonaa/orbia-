export type ApiErrorInfo = {
  message: string;
  code?: string;
  status: number;
};

const DEFAULT_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Tu sesión venció. Volvé a iniciar sesión.",
  AUTH_EXPIRED: "Tu sesión venció. Volvé a iniciar sesión.",
  AUTH_INVALID: "Tu sesión no es válida. Iniciá sesión nuevamente.",
  TOKEN_REQUIRED: "Tu sesión venció. Volvé a iniciar sesión.",
  TOKEN_EXPIRED: "Tu sesión venció. Volvé a iniciar sesión.",
  TOKEN_INVALID: "Tu sesión no es válida. Iniciá sesión nuevamente.",
  FORBIDDEN: "No tenés permisos para acceder a esta sección.",
  PERMISSION_DENIED: "No tenés permisos para realizar esta acción.",
  PLAN_BLOCKED: "Tu plan no incluye esta función. Tocá “Mejorar plan” para solicitar el upgrade.",
  FEATURE_BLOCKED: "Tu plan no incluye esta función. Tocá “Mejorar plan” para solicitar el upgrade.",
  INVALID_PAYLOAD: "Datos inválidos. Revisá los campos e intentá de nuevo.",
  VALIDATION_ERROR: "Datos inválidos. Revisá los campos e intentá de nuevo.",
  BAD_REQUEST: "Datos inválidos. Revisá los campos e intentá de nuevo.",
  INTERNAL_ERROR: "Ocurrió un problema inesperado. Intentá nuevamente en unos segundos.",
  STT_SERVICE_UNAVAILABLE: "El servicio de voz está temporalmente no disponible. Probá de nuevo en unos segundos.",
  STT_TIMEOUT: "La interpretación de voz demoró demasiado. Probá nuevamente.",
  STT_BAD_RESPONSE: "No pudimos interpretar el audio por un problema del servicio de voz.",
  STT_INVALID_PAYLOAD: "El audio o texto enviado no es válido para interpretar.",
  STT_AUDIO_TOO_LARGE: "El audio es demasiado largo. Grabá un mensaje más corto.",
  SEARCH_FILTER_REQUIRED: "Necesitamos más datos para ejecutar la búsqueda (por ejemplo nombre completo o DNI).",
  INTENT_TICKET_INVALID: "La confirmación de voz venció. Tocá ‘No, corregir’ o grabá de nuevo.",
  DATA_EXFIL_BLOCKED: "La consulta solicitada no está permitida por seguridad.",
  PROVIDER_PURCHASES_NOT_SUPPORTED: "Para compras a proveedor usá el módulo de Compras.",
  INTENT_NOT_ALLOWED: "Ese comando de voz todavía no está habilitado.",
};

const AUTH_ERROR_CODES = new Set([
  "AUTH_REQUIRED",
  "AUTH_EXPIRED",
  "AUTH_INVALID",
  "TOKEN_REQUIRED",
  "TOKEN_EXPIRED",
  "TOKEN_INVALID",
]);

function isAuthErrorCode(code?: string) {
  return Boolean(code && AUTH_ERROR_CODES.has(String(code).toUpperCase()));
}

function formatMaxMb(bytes?: number) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return mb % 1 === 0 ? String(mb) : mb.toFixed(1);
}

export async function parseApiError(
  res: Response,
  options?: { maxUploadBytes?: number }
): Promise<ApiErrorInfo> {
  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  const code = parsed?.code;
  const errorObj = parsed?.error;
  const errorMsg = typeof errorObj === "object" && errorObj !== null ? errorObj.message : errorObj;
  const fallbackMessage = errorMsg || parsed?.message || raw || res.statusText;
  let message = fallbackMessage;

  if (code && DEFAULT_MESSAGES[code]) {
    message = DEFAULT_MESSAGES[code];
  } else if (res.status === 401) {
    message = isAuthErrorCode(code)
      ? "Tu sesión venció. Volvé a iniciar sesión."
      : (fallbackMessage || "No autorizado para esta operación.");
  } else if (res.status === 403) {
    message = "No tenés permisos para acceder a esta sección.";
  } else if (res.status >= 500) {
    message = DEFAULT_MESSAGES.INTERNAL_ERROR;
  }

  if (code === "UPLOAD_TOO_LARGE") {
    const maxMb = formatMaxMb(options?.maxUploadBytes);
    message = maxMb
      ? `Archivo demasiado grande. Máximo ${maxMb} MB.`
      : "Archivo demasiado grande. Verificá el tamaño permitido.";
  }

  return { message, code, status: res.status };
}
