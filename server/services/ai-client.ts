export type AiErrorCode = "AI_UNAVAILABLE" | "AI_TIMEOUT" | "AI_BAD_RESPONSE" | "AI_UNHEALTHY";

export class AiClientError extends Error {
  code: AiErrorCode;
  details?: unknown;
  constructor(code: AiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AiClientError";
    this.code = code;
    this.details = details;
  }
}

const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || "30000");
const AI_SERVICE_HOST = String(process.env.AI_SERVICE_HOST || "").trim();
const AI_SERVICE_PORT = Number(process.env.AI_SERVICE_PORT || "8000");
const AI_HEALTH_TTL_MS = Number(process.env.AI_HEALTH_TTL_MS || "10000");

let lastHealthCheckAt = 0;
let lastHealthOk = false;

function resolveAiServiceUrl() {
  const explicit = String(process.env.AI_SERVICE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (AI_SERVICE_HOST) return `http://${AI_SERVICE_HOST}:${AI_SERVICE_PORT}`;
  // Fallback de dev local para no romper entornos existentes.
  return `http://127.0.0.1:${AI_SERVICE_PORT}`;
}

export function getAiServiceUrl() {
  return resolveAiServiceUrl();
}

function extractAiErrorMessage(body: any, fallback: string) {
  if (typeof body?.error === "string") return body.error;
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.detail === "string") return body.detail;
  if (body?.detail && typeof body.detail === "object") {
    if (typeof body.detail.error === "string") return body.detail.error;
    if (typeof body.detail.message === "string") return body.detail.message;
    if (typeof body.detail.error_code === "string") return body.detail.error_code;
    try {
      return JSON.stringify(body.detail);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function fetchWithTimeout(path: string, init: RequestInit) {
  const aiUrl = resolveAiServiceUrl();
  if (!aiUrl) {
    throw new AiClientError("AI_UNAVAILABLE", "AI_SERVICE_URL no está configurado");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${aiUrl}${path}`, { ...init, signal: controller.signal });
    return res;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new AiClientError("AI_TIMEOUT", "Timeout contactando servicio de IA");
    }
    throw new AiClientError("AI_UNAVAILABLE", "Servicio de IA inaccesible", { message: err?.message, aiUrl, path });
  } finally {
    clearTimeout(timeout);
  }
}

export async function aiEnsureHealthy(force = false) {
  const now = Date.now();
  if (!force && now - lastHealthCheckAt <= AI_HEALTH_TTL_MS) {
    if (!lastHealthOk) throw new AiClientError("AI_UNHEALTHY", "Servicio de IA no saludable");
    return true;
  }
  try {
    const res = await fetchWithTimeout("/health", { method: "GET", headers: { Accept: "application/json" } });
    const json = await res.json().catch(() => ({}));
    const ok = res.ok && (json?.ok === true || json?.status === "ok");
    lastHealthCheckAt = now;
    lastHealthOk = ok;
    if (!ok) {
      throw new AiClientError("AI_UNHEALTHY", "Healthcheck de IA inválido", { status: res.status, body: json });
    }
    return true;
  } catch (err) {
    lastHealthCheckAt = now;
    lastHealthOk = false;
    if (err instanceof AiClientError) throw err;
    throw new AiClientError("AI_UNHEALTHY", "No se pudo validar health de IA", err);
  }
}

export async function aiGetJson(path: string, headers?: Record<string, string>) {
  if (path !== "/health") {
    await aiEnsureHealthy(false);
  }
  const res = await fetchWithTimeout(path, { method: "GET", headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AiClientError("AI_BAD_RESPONSE", extractAiErrorMessage(body, `AI GET ${path} failed`), { status: res.status, body });
  }
  return body;
}

export async function aiPostForm(path: string, form: FormData, headers?: Record<string, string>) {
  await aiEnsureHealthy(false);
  const res = await fetchWithTimeout(path, { method: "POST", body: form, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new AiClientError("AI_BAD_RESPONSE", extractAiErrorMessage(body, `AI POST ${path} failed`), { status: res.status, body });
  }
  return body;
}
