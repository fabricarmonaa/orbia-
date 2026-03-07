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
let lastHealthyBaseUrl: string | null = null;

function normalizeUrl(url: string) {
  return url.trim().replace(/\/$/, "");
}

function resolveAiServiceCandidates() {
  const explicitRaw = String(process.env.AI_SERVICE_URL || "").trim();
  const explicit = explicitRaw
    ? explicitRaw
        .split(",")
        .map((part) => normalizeUrl(part))
        .filter(Boolean)
    : [];

  const fromHost = AI_SERVICE_HOST ? [`http://${AI_SERVICE_HOST}:${AI_SERVICE_PORT}`] : [];
  const localFallbacks = [`http://127.0.0.1:${AI_SERVICE_PORT}`, `http://localhost:${AI_SERVICE_PORT}`];

  const all = [...explicit, ...fromHost, ...localFallbacks];
  const unique: string[] = [];
  for (const url of all) {
    if (!unique.includes(url)) unique.push(url);
  }
  return unique;
}

export function getAiServiceUrl() {
  return lastHealthyBaseUrl || resolveAiServiceCandidates()[0] || `http://127.0.0.1:${AI_SERVICE_PORT}`;
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
  const candidates = resolveAiServiceCandidates();
  if (!candidates.length) {
    throw new AiClientError("AI_UNAVAILABLE", "AI_SERVICE_URL no está configurado");
  }

  let timeoutHit = false;
  const unavailableErrors: Array<{ baseUrl: string; message: string }> = [];

  for (const baseUrl of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
      lastHealthyBaseUrl = baseUrl;
      return res;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        timeoutHit = true;
      } else {
        unavailableErrors.push({ baseUrl, message: String(err?.message || "unknown") });
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (timeoutHit) {
    throw new AiClientError("AI_TIMEOUT", "Timeout contactando servicio de IA", { candidates });
  }

  throw new AiClientError("AI_UNAVAILABLE", "Servicio de IA inaccesible", { candidates, errors: unavailableErrors });
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
